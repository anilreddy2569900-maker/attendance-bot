# Attendance Bot

Submit a whole list of UG numbers to the attendance form in one go. **You only type the OTP.**

The script reads the names and numbers from `students.xlsx`, opens the form in a hidden (headless) browser, and submits everyone a few seconds after you enter the OTP. It then shows you, for each student, exactly what the server replied.

> Windows only. Needs an internet connection. **Or skip all of it and use the website below.**

---

## Or just use the website (nothing to install)

### **https://mark-attendance-ug26.vercel.app**

Works the same way, from any browser (phone included):

1. **Drop `students.xlsx` on the page once** (or paste the list). The list is remembered on that device, so next time you only need the OTP.
2. **Type the OTP and press Run.** Everyone is submitted within a few seconds.
3. Each student gets the same **OK / FAIL / ERROR / CHECK** results. **Retry failed** re-sends only the failed ones (type the corrected OTP first), **Download CSV** saves the results like the desktop tool.

### Excel format

| | A | B |
|---|---|---|
| **1** | Name | UG Number |
| **2** | Rohan Mehta | 41011 |
| **3** | Simran Kaur | 41408 |

- **One student per row** — name in one column, UG number in another. Column order doesn't matter; the number column is detected automatically.
- **UG number = just the number**, like `41011`. Do **not** type `UG/26/41011` — the site adds `UG/26/` itself. (Full IDs like `UG/26/41011` still work if you already have them.)
- **Header row is optional** — a row saying “Name / UG Number” is skipped automatically.
- **Empty rows, duplicates and typos** (like `4I923` with a letter I) are skipped and shown as warnings.
- `.csv`, `.txt`, or a list pasted as `Name number` per line works too.

To change the student list later, just upload (or paste) the new one — it **adds to** the saved list, and each row can be removed with the ✕ button.

---

## 1. One-time setup (about 2 minutes)

### Step 1: Install Python (skip if you already have it)
1. Go to <https://www.python.org/downloads/> and click the big yellow **Download Python** button.
2. Run the installer. **On the first screen, tick "Add python.exe to PATH"**, then click **Install Now**.

### Step 2: Download this project
1. On this GitHub page, click the green **Code** button, then **Download ZIP**.
2. Right-click the downloaded ZIP, choose **Extract All...**, and pick a place you'll keep it (for example `Documents`).
   Don't run it from inside the ZIP, and don't delete or move the folder later, because the shortcut points to it.

### Step 3: Run setup
1. Open the extracted folder and **double-click `setup.bat`**.
   - If Windows shows *"Windows protected your PC"*, click **More info**, then **Run anyway**. (This happens with any downloaded script.)
2. Wait for **Setup complete!**. It installs the packages, downloads the headless browser (~150 MB), and creates the shortcut.

You'll now have a **Submit (enter OTP)** shortcut:
- on your **Desktop**
- in the **Start menu**. Search for "Submit". To pin it, right-click it and choose **Pin to Start** or **Pin to taskbar**.

---

## 2. Put your students in `students.xlsx`

Open `students.xlsx` in the project folder. Use this layout:

| | A | B |
|---|---|---|
| **1** | Name | UG Number |
| **2** | Rohan Mehta | 41011 |
| **3** | Simran Kaur | 41408 |

(The sample above uses fictional names — in your copy, use your real class list.)

- **Column B: just the number** (e.g. `41011`). The script adds `UG/26/` itself, so `41011` is sent as `UG/26/41011`.
- Empty rows, duplicates and typos (like `4I923` with a letter I) are skipped and shown as warnings.
- **Save and close Excel** before running.

---

## 3. Every time you use it

1. **Double-click "Submit (enter OTP)".** A window opens and lists everyone it found. Check the list.
2. **Type the OTP and press Enter.** You can type it right away; the form loads in the background while you type.
3. Within a few seconds you'll see one line per student:

   ```
   OK     UG/26/41011      Rohan Mehta     Attendance marked successfully
   FAIL   UG/26/41408      Simran Kaur     Incorrect OTP.

   OK 10  |  FAIL 1  |  ERROR 0  |  CHECK 0
   ```

4. If anyone shows **FAIL** or **ERROR**, it asks:
   ```
   Retry the 1 FAIL/ERROR? Type a new OTP, Enter = same OTP, q = quit:
   ```
   - **Wrong OTP?** Type the correct one.
   - **Network hiccup?** Just press **Enter** to retry with the same OTP.
   - **Done?** Type **q**.

   Only the failed students are sent again. The ones that already worked are not resent.

5. Press any key to close the window. A `results_<date>_<time>.csv` file is saved in the project folder with everyone's result.

### What the results mean

| Result | Meaning | What to do |
|---|---|---|
| **OK** | Server accepted it ("marked", "submitted", "already marked"...) | Nothing |
| **FAIL** | Server rejected it ("Incorrect OTP", "Invalid"...) | Retry with the right OTP |
| **ERROR** | No reply (network problem) | Press Enter to retry |
| **CHECK** | Server said something unrecognised | Read the message on that line yourself |

---

## What happens when you press the shortcut

1. `run.bat` starts `bulk_submit.py` with `students.xlsx`.
2. The sheet is read (never modified), the UG column is found automatically, and `UG/26/` is added.
3. The OTP prompt appears **immediately**. At the same time a hidden Chrome loads the form (about 4 s).
4. When you press Enter, it waits for the form if it's still loading, then calls the same server function the **Mark Attendance** button calls (`submitStudentAttendance(ug, otp)`), 4 students at a time.
5. Each reply is sorted into OK / FAIL / ERROR / CHECK and shown.

**Built-in safety nets:**
- If the form fails to load, it retries up to 4 times and starts a fresh browser if needed.
- If a student gets no reply, it retries, then reloads the form and tries once more.
- If the form has been sitting open for more than 10 minutes, it reloads a fresh copy before submitting.
- If the browser crashes, it is detected and restarted.
- If you press Ctrl+C, it stops cleanly and still saves the results.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `Python was not found` | Install Python (step 1). Make sure **Add python.exe to PATH** was ticked, then run `setup.bat` again. |
| `Can't open students.xlsx - close it in Excel` | Close the file in Excel and run again. |
| Window flashes and closes | Run `setup.bat` again. If it still happens, open the folder, type `cmd` in the address bar, press Enter, run `run.bat`, and read the error. |
| A student shows **CHECK** | The server's reply wasn't recognised. Read the message: if it's actually a success, it went through. |
| Shortcut stopped working | You moved the folder. Run `setup.bat` again from the new location. |

## Advanced (command line)

```
python bulk_submit.py students.xlsx --otp 123456      # no prompt, one round
python bulk_submit.py students.xlsx --prefix UG/27/   # different prefix
python bulk_submit.py students.xlsx --mode click      # type into the boxes and click, instead of calling the function
python bulk_submit.py students.xlsx --headed          # show the browser window
```

## Website source code

The Vercel site (https://mark-attendance-ug26.vercel.app) lives in this same repo:

- **[`web/`](web/)** — all the website code: `index.html`, `app.js`, `styles.css` (and the bundled xlsx parser). Website-only changes are simply changes touching only this folder.
- **`api/submit.js`** — the serverless function the website calls to submit to the form.
- **`website` branch** — a mirror branch named for the website, kept on the same repo (no separate repo), refreshed when the site changes.

The sample names and numbers in `students.xlsx` here are fictional placeholders — keep your real class list in your local copy only.
