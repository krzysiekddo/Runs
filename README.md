# Runs

Aplikacja wspierająca trening biegowy (Vite, React, TypeScript, Firebase).

- **Onboarding**: cel (zawody, forma, regularność), aktualny wynik na 5/10 km, kilometraż, tętno, dni treningowe.
- **Plan**: generowany regułami – tempa z modelu VDOT Danielsa, okresy (baza, rozwój, szczyt, roztrenowanie), wzrost kilometrażu ~8%/tydzień, co 4. tydzień lżejszy.
- **Dodawanie biegu**: screen aktywności ze Stravy (i opcjonalnie międzyczasów) jest odczytywany w przeglądarce przez Tesseract.js; dane można poprawić przed zapisem albo wpisać ręcznie.
- **Ocena biegu**: porównanie z treningiem z planu (dystans, tempo, strefa tętna, międzyczasy).
- **Postępy**: prognozy wyników, kilometraż tygodniowy, strefy tempa i tętna, przebieg butów.

Dane każdego użytkownika są w Firestore pod `users/{uid}` (profil i plan) oraz `users/{uid}/runs`.

## Konfiguracja Firebase

1. W [konsoli Firebase](https://console.firebase.google.com/) utwórz projekt.
2. Wejdź w **Authentication > Sign-in method** i włącz dostawcę **Google**.
3. W **Project settings > General > Your apps** dodaj aplikację webową i skopiuj jej konfigurację.
4. Wejdź w **Firestore Database > Create database** (tryb produkcyjny, region np. `eur3`).
5. W zakładce **Rules** wklej zawartość pliku `firestore.rules` i kliknij **Publish**.
6. Skopiuj `.env.example` do `.env` i uzupełnij wartości.

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
