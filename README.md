# JAMHUURIA PRIMARY & KG SCHOOL — School Management System

Responsive web application for phones, tablets and computers. The SQLite database is created automatically in `data/jamhuuria.sqlite` when the server starts.

## Features
- Admin and Teacher login; **students have no login**.
- Student registration and directory.
- Daily attendance (Present, Absent, Late, Excused).
- Fee payment records.
- Exam scores and automatic grade display.
- Teacher account creation (Admin only).
- Admin JSON backup download and password change.
- Responsive green & gold design, school logo and administrator profile strip.

## Run on a computer / server
1. Install Node.js 18 or newer.
2. Extract this folder.
3. Copy `.env.example` to `.env` and change `SESSION_SECRET` and `ADMIN_PASSWORD` to private values.
4. In this folder run:
   ```bash
   npm install
   npm start
   ```
5. Open `http://localhost:3000`.

Default first-run admin username is `admin`. The password is `ChangeMe123!` only when no `.env` file overrides it. Change it immediately in **Settings**.

## Online use from multiple devices
Deploy this Node.js project to a host that supports persistent disk storage and HTTPS. Keep the `data/` directory on a persistent volume so SQLite data is not lost when the service restarts or redeploys. Set `SESSION_SECRET` and `ADMIN_PASSWORD` as private environment variables. Then Admin and Teachers can use the same online URL and shared database from phones and computers.

## Important
This is a complete starter application, but it is not yet deployed to a public school URL. A database file is created on the server at first run. Do not use the default password online. For a large multi-user deployment, use PostgreSQL and a managed production session store rather than SQLite.
