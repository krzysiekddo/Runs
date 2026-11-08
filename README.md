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

Aplikacja działa pod adresem <http://localhost:5173>. Domena `localhost` jest domyślnie autoryzowana w Firebase.
Domenę produkcyjną dodaj w **Authentication > Settings > Authorized domains**.
