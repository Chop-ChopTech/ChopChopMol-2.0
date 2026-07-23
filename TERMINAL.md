# How the Terminal Works

A plain-English guide to the in-app terminal — the black command-line panel that
slides up from the bottom when you click **Terminal** in the top toolbar.

---

## The short version

The terminal in your browser is a **dumb pipe**. It doesn't understand commands.
It doesn't know what a prompt is. It can't tell when something finished running.

All it does is:

1. Send every key you press to a server.
2. Draw every character the server sends back.

The real shell — the thing that actually understands `ls` and `cd` — is running
on a server, inside a private container just for you. Your browser is only a
window into it.

Here's the whole system:

```
   You
    |  types keys
    v
+-------------------+
|  Your browser     |
|  (terminal panel) |
+-------------------+
    |  ^
    |  |   a WebSocket: a two-way, always-open connection
    v  |
+-------------------+
|  Caddy            |   traffic cop at api.chopchopmol.com
+-------------------+
    |  ^
    v  |
+-------------------+
|  Terminal gateway |   checks who you are, then hands you a container
+-------------------+
    |  ^
    v  |
+-------------------+
|  Your container   |   a private, sandboxed box with a real shell inside
+-------------------+
```

Everything below is just detail on those boxes.

---

## Who uses it

One kind of person: **a logged-in user.** Either you signed in with Firebase, or
you're a guest with the bypass code. If you're neither, the panel opens but
immediately says *"Sign in to use the terminal"* and never even tries to connect.

There's no admin role, no background job, no AI involvement. The AI assistant
cannot use this terminal — it has its own separate way of running code (more on
that at the bottom).

---

## What happens when you click the button

**Step 1 — The panel opens.**
The toolbar button calls `toggle()`. The panel slides up from the bottom with a
CSS animation.

**Step 2 — It waits 60 milliseconds.**
This looks like a random delay, but it's deliberate. The panel is still *sliding*
for a moment after it starts opening. If you measure how wide it is during the
slide, you get the wrong answer, and the terminal ends up with the wrong number
of columns. So the code waits for the animation to finish before measuring.

**Step 3 — It builds the terminal display.**
The character grid you see is drawn by a library called **xterm.js**, loaded from
the internet (a CDN) rather than bundled with the app. This only happens the
first time you open the panel; after that the same instance is reused.

**Step 4 — It measures and connects.**
It works out how many rows and columns fit, then opens the connection to the
server.

---

## The connection, and one annoying problem

The connection is a **WebSocket**. A normal web request is like sending a letter:
you ask, you get one reply, done. A WebSocket is like a phone call: the line
stays open and both sides can talk whenever they want. That's exactly what a
terminal needs, since the server might print something at any moment without you
asking.

**Here's the annoying problem.** Everywhere else in this app, the app proves who
you are by attaching your login token as a *header* — a hidden label on the
request. But web browsers don't let you put headers on a WebSocket. The feature
simply doesn't exist in the browser.

So the token gets put in the **web address** instead:

```
wss://api.chopchopmol.com/terminal/ws?token=YOUR_LOGIN_TOKEN
```

Guests send `?guest=0852` instead.

Two small things worth knowing about that address:

- It starts with `wss://`, not `https://`. That's the "secure WebSocket" prefix.
  The code builds it by taking the normal server address and swapping the
  beginning. This is required — browsers block insecure connections from a
  secure page.
- Putting a login token in a URL is slightly riskier than putting it in a header,
  because URLs tend to show up in server logs. It's the standard workaround for
  browser WebSockets, but it's a real tradeoff, not a free one.

---

## What actually travels over the connection

Three kinds of messages. The clever bit is that **the *format* of the message is
what tells the server what it means** — there's no wrapper or label.

| Direction | What | Format |
|---|---|---|
| Browser → server | Your keystrokes | Plain text, sent raw |
| Browser → server | "The window changed size" | Text, as JSON: `{"type":"resize","cols":80,"rows":24}` |
| Server → browser | Whatever the shell prints | Binary (raw bytes) |

Why does the size message matter? The shell on the server needs to know how wide
your window is, otherwise long lines wrap in the wrong place and everything looks
scrambled. It gets sent once when you connect, and again every time you drag the
panel bigger or smaller.

Why send output as *binary* when input is *text*? Because it makes the two
impossible to mix up. If everything were text, and you literally typed
`{"type":"resize","cols":1}` at your shell prompt, the server might mistake your
typing for a real command. Using different formats for the two directions solves
that for free, with no escaping tricks.

---

## What's on the server

> **Honest caveat:** the server side is **not in this repository.** Everything in
> this section comes from the comments in `demo/terminal.js` and from what the
> browser code's behavior implies. Nobody has read that server's actual source
> while writing this document. Treat it as a well-informed description, not
> verified fact.

Two pieces:

**Caddy** is a traffic cop sitting at `api.chopchopmol.com`. It looks at the
address of every incoming request and sends it to the right place. Anything
starting with `/terminal/ws` goes to the terminal gateway. Anything starting with
`/ai/` or `/api/` goes to the main Python backend instead. Caddy also handles the
HTTPS encryption certificate automatically.

**The terminal gateway** is a separate program whose only job is terminals. When
your connection arrives, it:

1. Reads the token out of the address and checks it's genuine.
2. Starts (or finds) a **private container** for you — a sealed-off mini
   computer with its own filesystem, so nothing you do can touch anyone else's
   session or the real server.
3. Starts a shell inside it, attached to something called a **PTY**.

A PTY ("pseudo-terminal") is a fake terminal the operating system provides. It
tricks programs into thinking they're connected to a real physical terminal.
Without it, interactive programs like `vim` or `top` won't work properly and you
won't even get a colored prompt. It's the piece that makes a shell feel like a
shell.

After that, the gateway just relays: your keystrokes go into the PTY, and
whatever the PTY prints comes back out to your browser.

---

## When things go wrong

The server can hang up with a numbered reason. The browser reacts differently
depending on the number:

| What happened | What you see | Does it retry? |
|---|---|---|
| Your login isn't valid (code 4401) | "Unauthorized — sign in again" | **No** |
| Server is full (code 4503) | "Server at capacity — retry shortly" | **No** |
| You closed the panel yourself | "Disconnected" | **No** |
| Anything else — network blip, server restart | "Reconnecting…" | **Yes** |

For that last case, it prints a yellow `[disconnected — reconnecting…]` right
into the terminal so you can see what happened, then retries — waiting 1 second,
then 2, then 4, then 8, up to a maximum of 15 seconds between attempts. Once it
reconnects successfully, the wait resets back to 1 second.

**Why do the first two never retry?** Because retrying them is pointless. A bad
login token won't become good on its own, and repeatedly hammering a server
that's already full just makes it worse. Only *ambiguous* failures — where the
problem might genuinely be temporary — are worth another try.

The retry also double-checks that the panel is still open before firing, so
closing the panel truly stops it rather than leaving something reconnecting
invisibly in the background.

---

## Why there's so much fussy code about fonts

There's a chunk of `terminal.js` that looks like paranoid over-engineering. It's
all fixing one specific bug: **letters looking unevenly spaced.**

Three separate causes, three separate fixes:

**1. The wrong font gets picked.** In CSS you can just write `monospace` and let
the computer choose a fixed-width font. But every computer chooses differently,
and some choices don't match what the terminal measured. So the code names
JetBrains Mono explicitly, with a list of specific backups — never the vague
`monospace` keyword.

**2. Letters drift out of line.** The default way of drawing text lets tiny
rounding errors build up across a row, so characters slowly slide out of their
columns. The fix is a **WebGL renderer**, which paints every character at an
exact pixel position on a fixed grid. It's loaded carefully, so that a computer
without WebGL support quietly falls back to the normal method instead of showing
a broken terminal.

**3. The font arrives too late.** This one is genuinely sneaky. xterm.js measures
how wide a character is *once*, right when it starts up. But JetBrains Mono is
downloaded from Google Fonts, and that download might not be finished yet. So
xterm measures a *backup* font, remembers those measurements, and then the real
font shows up — and now every column is wrong. The fix waits for the font to
finish downloading, throws away the old measurements, and re-measures everything.

---

## Three things that sound the same but aren't

This app has **three** different ways to run something on a remote machine. They
are easy to confuse and completely separate.

| | **Terminal** | **`execute_python` (AI tool)** | **Remote Files** |
|---|---|---|---|
| What it is | A real shell you type into | The AI running Python for you | Browsing files on *your own* server |
| Talks to | The terminal gateway | The main Python backend | The main Python backend |
| How | WebSocket | Normal web request | SSH/SFTP, proxied |
| Runs where | Your private container | Inside the backend itself | Your own remote machine |
| Who starts it | You | The AI (you approve it) | You |

The terminal is the only one of the three that doesn't touch the main Python
backend at all.

---

## Where the code lives

| File | What's in it |
|---|---|
| `demo/terminal.js` | Everything: the panel, the connection, the reconnect logic. ~270 lines. |
| `demo/utils/apiUtils.js` | `getWsUrl()` — builds the `wss://` address |
| `demo/index.html` | The toolbar button, the panel's HTML, and the xterm.js `<script>` tags |
| `demo/style.css` | How the panel looks |
| *(not in this repo)* | The gateway server itself |

If you only read one thing, read `demo/terminal.js` top to bottom — it's short,
and the comments at the top explain the connection format in a few lines.
