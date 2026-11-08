# Runs

Aplikacja webowa (Vite, React, TypeScript) z logowaniem Google przez Firebase Authentication.

## Konfiguracja Firebase

1. W [konsoli Firebase](https://console.firebase.google.com/) utwórz projekt.
2. Wejdź w **Authentication > Sign-in method** i włącz dostawcę **Google**.
3. W **Project settings > General > Your apps** dodaj aplikację webową i skopiuj jej konfigurację.
4. Skopiuj `.env.example` do `.env` i uzupełnij wartości.

## Uruchomienie

```sh
npm install
npm run dev
```

Aplikacja działa pod adresem <http://localhost:5173/Runs/>. Domena `localhost` jest domyślnie autoryzowana w Firebase.

## Wdrożenie na GitHub Pages

Każdy push na `main` buduje i publikuje aplikację pod adresem <https://krzysiekddo.github.io/Runs/> (workflow `.github/workflows/deploy.yml`).

1. W **Settings > Pages** repozytorium ustaw **Source: GitHub Actions**.
2. W **Settings > Secrets and variables > Actions** dodaj wartości z `.env` jako sekrety o tych samych nazwach.
3. W konsoli Firebase, w **Authentication > Settings > Authorized domains**, dodaj `krzysiekddo.github.io`.
