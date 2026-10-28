# Setting up Firebase

You need two Firebase projects, set up the same way:

- **badminton-dev** — mock data, used by the **alpha** (`…/alpha/`). Created: `badminton-dev-bc258`.
- **badminton-prod** — the real data, used by the **beta** (`…/beta/`, test friends) and
  **production** (`…/`, the club).

Start with **badminton-dev**; the production project can wait until the alpha works.

It takes about 15 minutes per project. You need a Google account; the Blaze step also needs a
payment card.

## 1. Create the project

1. Go to <https://console.firebase.google.com> and sign in with your Google account.
2. Click **Create a project** (or **Add project**).
3. Name: `badminton-dev`. Firebase shows the project ID under the name (for example
   `badminton-dev-1a2b3`); write it down.
4. Gemini in Firebase and Google Analytics: you can switch both **off**; the app doesn't need them.
5. Click **Create project** and wait until it's ready.

## 2. Register the web app

1. On the project's start page, click the **</>** (Web) icon, under "Get started by adding
   Firebase to your app".
2. App nickname: `badminton-web`. Leave **Firebase Hosting unticked** (the app stays on GitHub
   Pages).
3. Click **Register app**. Firebase shows a block of code with `const firebaseConfig = { … }`.
4. **Copy that `firebaseConfig` block** and keep it; you'll send it to me. (It's also available
   later under the gear icon → **Project settings** → **General** → *Your apps*.)

## 3. Turn on sign-in

1. Left menu: **Build → Authentication → Get started**.
2. Tab **Sign-in method**:
   - **Google** → enable → choose your e-mail address as *project support e-mail* → **Save**.
   - **Email/Password** → enable **Email link (passwordless sign-in)** → **Save**. (The plain
     e-mail/password option can stay off.)
3. Tab **Settings → Authorized domains** → **Add domain** → `jorissaenen.github.io`.
   (`localhost` is already listed; that's for testing.)

## 4. Create the database

1. Left menu: **Build → Firestore Database → Create database**.
2. Edition: **Standard**. Database ID: leave **(default)**.
3. Location: **europe-west1 (Belgium)**. This can't be changed later.
4. Security rules: **Start in production mode** (everything locked; I'll write the real rules).
5. Click **Create**.

## 4b. Publish the security rules

Once step 8 is done, GitHub publishes the rules automatically after every change, and you can skip
this step. Until then:

The rules decide who may read and write what. They live in the repository as
[`firestore.rules`](../firestore.rules); when they change, I'll tell you to publish them again.
Before every change they are tested automatically against a local copy of Firestore (`npm run
test:rules`).

1. Left menu: **Build → Firestore Database** → tab **Rules**.
2. Replace everything in the editor with the contents of `firestore.rules`.
3. Click **Publish**.

Check: in the alpha, sign in (⚙ → Account). It should say **Database: connected ✓**. If it says the
rules aren't published yet, repeat these steps.

**E-mail link on iPhone:** iOS opens links in Safari, never in the installed app, and the two don't
share their storage. So when the link was asked for in the installed app, Safari offers *Copy
link*; then open the app, ⚙ → Account, and paste it in the box under *Send link*. (In the e-mail you
can also press and hold the link → *Copy* and paste it straight into the app.)

## 5. Pay-as-you-go plan (Blaze) with a budget alert

Reminders (and later the watch apps and statistics) run as Cloud Functions, which need the
**Blaze** pay-as-you-go plan. For a club this size, usage stays inside the free allowance, so it
should cost nothing; the budget alert warns you by e-mail if that ever changes.

1. Bottom left in the Firebase console: **Upgrade** (next to "Spark plan") → **Blaze** → link or
   create a **Cloud Billing account** (payment card).
2. Firebase offers to set a budget during the upgrade. Otherwise: open
   <https://console.cloud.google.com/billing> → your billing account → **Budgets & alerts** →
   **Create budget** → amount **€5** → alerts at 50 %, 90 % and 100 % → **Finish**.

A budget alert only sends e-mails; it doesn't stop anything. At this scale that is enough.

## 6. What to send me

- The **`firebaseConfig`** block of each project (from step 2), and the **project ID**.
- The **Web Push key** of each project (step 7).

That's all. These values are **not secret**: every web app that uses Firebase has them in its
code; the security rules decide who may read or write.

**Never send** passwords, a *service account* key (a downloaded `.json` file with
`"private_key"` in it), or your payment details. The service account key of step 8 goes straight
into GitHub, by you; it never passes through the chat.

## 7. Web Push key (for reminders)

1. Firebase console → gear icon → **Project settings** → tab **Cloud Messaging**.
2. Under **Web configuration** → **Web Push certificates** → **Generate key pair**.
3. Copy the long text under **Key pair** and send it to me. It's a *public* key, not secret.

## 8. Let GitHub deploy the rules and the reminder function

GitHub Actions tests every change to the rules and Cloud Functions and then deploys them to the
project. For that it needs a key of its own, which you store in GitHub as a secret: nobody can read
it back, not even me.

1. Open <https://console.cloud.google.com/iam-admin/serviceaccounts> and pick the project
   (`badminton-dev-…`) at the top.
2. **Create service account** → name `github-deploy` → **Create and continue**.
3. Give it these three roles (type each name in the role box, then **Add another role**):
   **Editor**, **Cloud Functions Admin**, **Service Account User** → **Continue** → **Done**.
4. Click the new `github-deploy` account → tab **Keys** → **Add key** → **Create new key** →
   **JSON** → **Create**. A `.json` file downloads.
5. Open <https://github.com/jorissaenen/badminton-score/settings/secrets/actions> →
   **New repository secret** → Name: `FIREBASE_SERVICE_ACCOUNT_DEV` → Secret: open the downloaded
   file in a text editor, copy **all** of it and paste it here → **Add secret**.
6. Delete the downloaded file from your computer.
7. Run the deployment once: <https://github.com/jorissaenen/badminton-score/actions/workflows/firebase.yml>
   → **Run workflow** → **Run workflow**. After a few minutes both jobs should show a green tick.
   The first time takes longer: Google switches on the services the function needs.

From then on every change to the rules or the function is tested and deployed automatically.

## Later: the production project

Repeat steps 1–4 with the name `badminton-prod` (and step 5 when needed), and send me its
`firebaseConfig` too. The alpha keeps using `badminton-dev` with its mock data; the beta and the
released app use `badminton-prod`, so mock data never mixes with the season's real results.
