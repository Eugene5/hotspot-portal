# Hotspot Portal pro UniFi UDM-SE

Externí portal pro Wi-Fi hotspot s OTP ověřením, GDPR a autorizací uživatelů přes UDM-SE API.

## Instalace

```bash
git clone <repo>
cd hotspot-portal
npm install
cp .env.example .env
# upravte .env s údaji pro SMTP, UDM-SE a Redis
npm start
```

## Struktura

- `server.js` – backend Node.js
- `otp.js` – generátor kódů
- `public/` – HTML stránka portálu
- `.env` – konfigurace
- `package.json` – závislosti Node.js