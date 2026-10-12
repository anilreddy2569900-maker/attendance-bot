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

## Use on Windows (optional)

1. Install [Python](https://www.python.org/downloads/) (tick **Add python.exe to PATH**).
2. Download this project (**Code → Download ZIP**) and extract it.
3. Double-click `setup.bat` once.
4. Put your students in `students.xlsx`, then double-click `run.bat` and type the OTP.

## What's in this project

| File | What it is |
|---|---|
| `web/` | The website |
| `api/submit.js` | The website's server part (needed by the website) |
| `bulk_submit.py`, `setup.bat`, `run.bat` | The Windows version |
| `students.xlsx` | Sample student list |
