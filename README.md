# Κλήρωση δώρων 19ου Δημοτικού Θεσσαλονίκης

Web εφαρμογή για κλήρωση δώρων από λαχνούς, έτοιμη για Vercel.

## Χρήση

1. Άνοιξε την ενότητα `Admin`.
2. Συμπλήρωσε `Σχολείο` και `Τίτλος`.
3. Στο πεδίο `Μπλοκάκια / εύρη λαχνών`, γράψε ένα εύρος ανά γραμμή.
   - `1-50` δημιουργεί τους λαχνούς `1` έως `50`
   - `52-60` δημιουργεί τους λαχνούς `52` έως `60`
   - `101-150` δημιουργεί τους λαχνούς `101` έως `150`
4. Στο πεδίο `Μεμονωμένοι λαχνοί`, βάλε τυχόν έξτρα λαχνούς ή διορθώσεις.
5. Στο πεδίο `Δώρα`, βάλε ένα δώρο ανά γραμμή. Η εφαρμογή βάζει αυτόματα σχετική εικόνα από το όνομα του δώρου.
   - Για δική σου εικόνα, γράψε `Δώρο | URL εικόνας`
   - Παράδειγμα: `Ποδήλατο | https://example.com/bike.jpg`
6. Διάλεξε πόσα δώρα θα κληρώνονται ανά παρτίδα και κάθε πόσα δευτερόλεπτα.
7. Γύρισε στην ενότητα `Κλήρωση` και πάτησε `Εκκίνηση`.
8. Όταν ολοκληρωθεί η κλήρωση, πάτησε `PDF αποτελεσμάτων`.

Τα δεδομένα αποθηκεύονται τοπικά στον browser για να μη χαθούν με ανανέωση της σελίδας.
Με Google SSO ενεργό, οι απλοί χρήστες βλέπουν μόνο τα αποτελέσματα. Το `geoklar@gmail.com` έχει δικαίωμα για `Admin`, εκκίνηση/παύση/νέα κλήρωση και αλλαγές δεδομένων.

## Τοπική εκτέλεση

```bash
npm install
npm run dev
```

Άνοιξε το `http://localhost:3000`.

## Postgres

Για αποθήκευση σε Postgres, όρισε το environment variable:

```bash
DATABASE_URL="postgresql://user:password@host:5432/database?sslmode=require"
```

Η εφαρμογή δημιουργεί αυτόματα τους πίνακες όταν καλέσει το `/api/state`. Αν θέλεις να τους δημιουργήσεις χειροκίνητα, τρέξε το SQL από το:

```text
migrations/001_init.sql
```

Οι πίνακες που χρησιμοποιούνται είναι:

- `lottery_settings` για σχολείο, τίτλο, εύρη λαχνών, μεμονωμένους λαχνούς, δώρα και ρυθμίσεις κλήρωσης.
- `lottery_results` για την τελική λίστα αποτελεσμάτων της κλήρωσης.

Αν δεν υπάρχει `DATABASE_URL`, η εφαρμογή λειτουργεί προσωρινά με τοπική αποθήκευση στον browser και εμφανίζει ένδειξη `Τοπικά`.

## Google SSO

Η εφαρμογή χρησιμοποιεί Google OAuth μέσω NextAuth. Χωρίς τα παρακάτω variables, η σελίδα μένει κλειδωμένη και εμφανίζει μήνυμα ότι δεν έχει ρυθμιστεί SSO.

```bash
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
NEXTAUTH_SECRET="..."
NEXTAUTH_URL="https://school-lottery.vercel.app"
```

Στο Google Cloud Console δημιούργησε OAuth Client τύπου `Web application` και πρόσθεσε redirect URI:

```text
https://school-lottery.vercel.app/api/auth/callback/google
```

Για local development μπορείς να προσθέσεις και:

```text
http://localhost:3000/api/auth/callback/google
http://127.0.0.1:3001/api/auth/callback/google
```

## Deploy στο Vercel

1. Ανέβασε τον φάκελο σε GitHub repository.
2. Στο Vercel, επίλεξε `New Project`.
3. Σύνδεσε το repository.
4. Πρόσθεσε τα `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL` στα Environment Variables του project.
5. Άφησε τις προεπιλογές για Next.js και πάτησε `Deploy`.
