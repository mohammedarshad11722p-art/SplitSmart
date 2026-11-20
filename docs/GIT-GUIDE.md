# Putting SplitSmart on GitHub (you do this, step by step)

## One-time setup

### 1. Install Git and tell it who you are
Check it's installed: `git --version`. If not, get it from git-scm.com.
```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"   # the email on your GitHub account
git config --global init.defaultBranch main
```
*Why:* every commit is stamped with this name and email. GitHub uses the email to link commits to your profile.

### 2. Create the empty repo on GitHub
github.com → **+** (top right) → **New repository**
- Name: `splitsmart`
- Public (judges can see it) or Private (you can switch later)
- **Leave "Add a README", ".gitignore" and "license" all unticked.** We already have a `.gitignore` and will write the README at the end. If GitHub creates files too, your first push gets rejected because the two histories don't match.
- Click **Create repository** and keep that page open. It shows your repo URL.

### 3. Get the project files onto your computer
Download the `splitsmart` folder from the project Library so it looks like this:
```
splitsmart/
├── .gitignore      ← hidden file. Make sure it came along (ls -a)
├── backend/
└── docs/
```

### 4. First commit on `main` (just the .gitignore)
`main` only ever holds finished, working code. Each step is built on its own branch and merged in through a pull request (PR).
```bash
cd SplitSmart
git init
git branch -M main
git add .gitignore
git commit -m "Initial commit: add .gitignore"
git remote add origin https://github.com/mohammedarshad11722p-art/SplitSmart.git
git push -u origin main
```
*Why commit .gitignore first:* it makes sure `.env` and `node_modules` are ignored from the very first commit, and gives `main` a starting point to branch from.

**Login:** GitHub no longer accepts your account password on the command line. Run `gh auth login` (GitHub CLI, choose HTTPS and log in through the browser), or paste a Personal Access Token (Settings → Developer settings → Tokens) when Git asks for a password.

### 5. Branch for steps 1 and 2
```bash
git switch -c step-01-02-schema-backend-setup
git status            # check .env / node_modules are NOT listed
git add .
git commit -m "Step 1-2: Prisma schema and backend setup"
git push -u origin step-01-02-schema-backend-setup
```

### 6. Open and merge the pull request
1. On the repo page, GitHub shows a yellow bar: **Compare & pull request**. Click it.
2. Base: `main`, compare: your step branch. Add a title and a short description of what the step does and how you tested it.
3. Click **Create pull request**, read the **Files changed** tab yourself (this is your code review), then **Merge pull request**.
4. Back in the terminal, bring your local `main` up to date:
```bash
git switch main
git pull
```

## Every later step (same loop)
```bash
git switch main
git pull                                  # start from the latest main
git switch -c step-03-bill-parsing        # new branch for this step
# copy in / write the new step's files, test them
git status
git add .
git commit -m "Step 3: bill upload and AI parsing"
git push -u origin step-03-bill-parsing
# GitHub → Compare & pull request → Merge → then:
git switch main
git pull
```
If you already copied the new files in before creating the branch, that's fine. Uncommitted changes come with you when you `git switch -c`.

Branch names for the plan: `step-03-bill-parsing`, `step-04-rooms-api`, `step-05-realtime-claiming`, `step-06-split-calculation`, `step-07-frontend`, `step-08-payment-links`, `step-09-deployment`, `step-10-readme-pitch`.

*Why branches + PRs:* a broken step never lands on `main`, so you always have a working version to demo. Judges also see a clean history with one PR per feature.

## Never commit
- `.env` (secrets). Only `.env.example` goes in git.
- `node_modules/` (huge, reinstalled with `npm install`).

If you ever push a secret by mistake, deleting the file isn't enough because it stays in history. Rotate the key in that service's dashboard right away.
