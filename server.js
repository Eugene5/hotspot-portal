import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import fetch from "node-fetch";
import Redis from "ioredis";
import { generateOTP } from "./otp.js";

dotenv.config();
const app = express();
app.use(bodyParser.json());
app.use(express.static("public"));

const redis = new Redis(process.env.REDIS_URL);

// SMTP konfigurace
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

// Odeslání ověřovacího kódu
app.post("/api/send-code", async (req, res) => {
  const { name, email, mac } = req.body;
  if (!name || !email || !mac) return res.status(400).json({ error: "chybí údaje" });

  const otp = generateOTP();
  await redis.hmset(`otp:${mac}`, { name, email, otp });
  await redis.expire(`otp:${mac}`, 600);

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: "Wi-Fi přístupový kód",
    text: `Dobrý den ${name}, váš ověřovací kód je ${otp}. Platnost 10 minut.`,
  });

  res.json({ ok: true, message: "Kód odeslán" });
});

// Ověření kódu a autorizace klienta na UDM-SE
app.post("/api/verify-code", async (req, res) => {
  const { mac, otp } = req.body;
  const data = await redis.hgetall(`otp:${mac}`);

  if (!data || data.otp !== otp) return res.status(400).json({ error: "Neplatný kód" });

  try {
    const response = await authorizeOnUDM(mac);
    await redis.del(`otp:${mac}`);
    res.json({ ok: true, message: "Přístup povolen", unifi: response });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Nepodařilo se připojit k UDM-SE" });
  }
});

// Funkce pro komunikaci s UDM-SE API
async function authorizeOnUDM(mac) {
  const login = await fetch(`${process.env.UNIFI_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: process.env.UNIFI_USER,
      password: process.env.UNIFI_PASS,
    }),
    agent: new (require("https").Agent)({ rejectUnauthorized: false }),
  });

  if (!login.ok) throw new Error("Login na UDM-SE selhal");

  const cookie = login.headers.raw()["set-cookie"].join("; ");
  const csrf = login.headers.get("x-csrf-token");

  const auth = await fetch(
    `${process.env.UNIFI_URL}/proxy/network/api/s/${process.env.UNIFI_SITE}/cmd/stamgr`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrf,
        Cookie: cookie,
      },
      body: JSON.stringify({ cmd: "authorize-guest", mac, minutes: process.env.SESSION_MINUTES }),
      agent: new (require("https").Agent)({ rejectUnauthorized: false }),
    }
  );

  if (!auth.ok) throw new Error(`Authorize failed ${auth.status}`);
  return await auth.json();
}

app.listen(process.env.PORT || 3000, () => console.log(`✅ Portal běží na portu ${process.env.PORT || 3000}`));