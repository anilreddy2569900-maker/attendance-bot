# Attendance Bot

Marks attendance for a whole class at once. **You only type the OTP.**

## Use the website (easiest)

Open **https://mark-attendance-ug26.vercel.app**

1. Upload your student list (Excel, CSV, or paste it). It is remembered on your device.
2. Type the OTP and press **Run**.
3. Each student shows **OK** or **FAIL**. Press **Retry failed** to resend only the failed ones.

### Student list format

One student per row: name, then UG number (just the number, like `41011`).

| Name | UG Number |
|---|---|
| Rohan Mehta | 41011 |
| Simran Kaur | 41408 |

## Run it on your own computer (optional)

Same website, running on your machine instead of the hosted one.

1. Install [Node.js](https://nodejs.org) (the big green **LTS** button).
2. Download this project (**Code → Download ZIP**) and extract it.
3. Double-click `start.bat`. Your browser opens the page. (On Mac/Linux: run `node server.js`, then open http://localhost:3000.)
4. Use it exactly like the website. Close the black window to stop.

## What's in this project

| File | What it is |
|---|---|
| `web/` | The page you see |
| `api/submit.js` | Sends each attendance request (used by the website and by `server.js`) |
| `server.js`, `start.bat` | Runs it on your own computer |
| `students.xlsx` | Sample student list |
