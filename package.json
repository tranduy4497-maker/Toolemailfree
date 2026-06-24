# Gmail Alias Inbox Tool

Tool web nhỏ để tạo địa chỉ Gmail ảo dạng:

```txt
yourname+randomtag@gmail.com
```

Đây **không phải** tool tạo tài khoản Gmail mới. Nó tạo alias theo cơ chế Gmail plus addressing. Tất cả email gửi tới alias sẽ đi vào inbox Gmail thật của bạn, sau đó app đọc bằng Gmail API.

## Tính năng

- Giao diện nền xanh.
- Ô chữ nhật hiển thị địa chỉ Gmail alias hiện tại.
- Nút **Tạo mới** sinh alias random mới.
- Khung inbox lớn hiển thị email gửi tới alias đó.
- Click email để đọc nội dung.
- Hỗ trợ email HTML bằng `iframe sandbox`.

## Kiến trúc

```txt
Browser UI
   |
   | HTTP
   v
Node.js Express Backend
   |
   | OAuth2 readonly
   v
Gmail API
```

## Cấu trúc project

```txt
gmail-alias-inbox/
├─ package.json
├─ .env.example
├─ .gitignore
├─ credentials.json        # tải từ Google Cloud, không commit
├─ token.json              # sinh sau khi chạy auth, không commit
├─ gmailAuth.js
├─ auth.js
├─ server.js
└─ public/
   └─ index.html
```

## 1. Tạo Google OAuth credentials

Vào Google Cloud Console:

1. Tạo project.
2. Enable **Gmail API**.
3. Tạo OAuth Client ID loại **Desktop app**.
4. Tải file JSON về.
5. Đổi tên thành:

```txt
credentials.json
```

Đặt file này ở thư mục gốc project.

Scope dùng trong project:

```txt
https://www.googleapis.com/auth/gmail.readonly
```

App chỉ đọc mail, không gửi, không xóa, không sửa. Nhân loại vẫn còn chút hy vọng.

## 2. Tạo file `package.json`

```json
{
  "name": "gmail-alias-inbox",
  "version": "1.0.0",
  "description": "Gmail plus-alias temporary inbox viewer",
  "type": "module",
  "private": true,
  "scripts": {
    "auth": "node auth.js",
    "dev": "node server.js"
  },
  "dependencies": {
    "@google-cloud/local-auth": "^3.0.1",
    "dotenv": "^16.4.7",
    "express": "^4.21.2",
    "googleapis": "^144.0.0"
  }
}
```

## 3. Tạo file `.env.example`

```env
# Gmail thật của bạn
GMAIL_BASE=your.real.account@gmail.com

# Prefix cho alias, ví dụ:
# your.real.account+tempabc123@gmail.com
ALIAS_PREFIX=temp

# Server port
PORT=3000

# Số ngày gần nhất để tìm email
INBOX_DAYS=30

# Số email tối đa hiển thị
MAX_RESULTS=25
```

Sau đó copy thành `.env`:

```bash
cp .env.example .env
```

Sửa `GMAIL_BASE` thành Gmail thật của bạn.

Ví dụ:

```env
GMAIL_BASE=teddy.engineer@gmail.com
ALIAS_PREFIX=rf
PORT=3000
INBOX_DAYS=30
MAX_RESULTS=25
```

## 4. Tạo file `.gitignore`

```gitignore
node_modules/
.env
credentials.json
token.json
.DS_Store
```

## 5. Tạo file `gmailAuth.js`

```js
import path from "node:path";
import process from "node:process";
import { promises as fs } from "node:fs";
import { authenticate } from "@google-cloud/local-auth";
import { google } from "googleapis";

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];
const TOKEN_PATH = path.join(process.cwd(), "token.json");
const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");

async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH, "utf8");
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch {
    return null;
  }
}

async function saveCredentials(client) {
  const content = await fs.readFile(CREDENTIALS_PATH, "utf8");
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;

  if (!client.credentials.refresh_token) {
    throw new Error(
      "Không nhận được refresh_token. Hãy xóa token.json nếu có, revoke quyền app trong Google Account, rồi chạy lại npm run auth."
    );
  }

  const payload = JSON.stringify(
    {
      type: "authorized_user",
      client_id: key.client_id,
      client_secret: key.client_secret,
      refresh_token: client.credentials.refresh_token
    },
    null,
    2
  );

  await fs.writeFile(TOKEN_PATH, payload);
}

export async function authorize() {
  let client = await loadSavedCredentialsIfExist();

  if (client) {
    return client;
  }

  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH
  });

  await saveCredentials(client);
  return client;
}
```

## 6. Tạo file `auth.js`

```js
import { authorize } from "./gmailAuth.js";

try {
  await authorize();
  console.log("OAuth OK. token.json đã được tạo.");
} catch (error) {
  console.error("OAuth failed:", error.message);
  process.exit(1);
}
```

## 7. Tạo file `server.js`

```js
import "dotenv/config";
import crypto from "node:crypto";
import express from "express";
import { google } from "googleapis";
import { authorize } from "./gmailAuth.js";

const app = express();

app.use(express.json());
app.use(express.static("public"));

const PORT = Number(process.env.PORT || 3000);
const GMAIL_BASE = mustEnv("GMAIL_BASE").trim().toLowerCase();
const ALIAS_PREFIX = sanitizeAliasTag(process.env.ALIAS_PREFIX || "temp");
const INBOX_DAYS = Number(process.env.INBOX_DAYS || 30);
const MAX_RESULTS = Math.min(Number(process.env.MAX_RESULTS || 25), 50);

const { local: BASE_LOCAL_RAW, domain: BASE_DOMAIN } = splitEmail(GMAIL_BASE);
const BASE_LOCAL = BASE_LOCAL_RAW.split("+")[0];

if (BASE_DOMAIN !== "gmail.com") {
  throw new Error("GMAIL_BASE phải là địa chỉ @gmail.com.");
}

let gmailClientPromise = null;

function mustEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Thiếu biến môi trường: ${name}`);
  }
  return value;
}

function splitEmail(email) {
  const atIndex = email.lastIndexOf("@");

  if (atIndex <= 0 || atIndex === email.length - 1) {
    throw new Error(`Email không hợp lệ: ${email}`);
  }

  return {
    local: email.slice(0, atIndex),
    domain: email.slice(atIndex + 1)
  };
}

function sanitizeAliasTag(value) {
  const cleaned = String(value).toLowerCase().replace(/[^a-z0-9]/g, "");
  return cleaned || "temp";
}

function createAlias() {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(5).toString("hex");
  const tag = `${ALIAS_PREFIX}${timestamp}${random}`;
  return `${BASE_LOCAL}+${tag}@gmail.com`;
}

function validateAlias(rawAlias) {
  const alias = String(rawAlias || "").trim().toLowerCase();

  if (!alias) {
    const error = new Error("Thiếu alias.");
    error.status = 400;
    throw error;
  }

  const expectedPrefix = `${BASE_LOCAL}+`;
  const expectedSuffix = "@gmail.com";

  if (!alias.startsWith(expectedPrefix) || !alias.endsWith(expectedSuffix)) {
    const error = new Error(
      `Alias không hợp lệ. Alias phải có dạng ${BASE_LOCAL}+tag@gmail.com`
    );
    error.status = 400;
    throw error;
  }

  return alias;
}

async function getGmailClient() {
  if (!gmailClientPromise) {
    gmailClientPromise = authorize().then((auth) =>
      google.gmail({
        version: "v1",
        auth
      })
    );
  }

  return gmailClientPromise;
}

function headerArrayToObject(headers = []) {
  const output = {};

  for (const header of headers) {
    if (!header.name) continue;
    output[header.name.toLowerCase()] = header.value || "";
  }

  return output;
}

function messageBelongsToAlias(headers, alias) {
  const haystack = [
    headers.to,
    headers.cc,
    headers.bcc,
    headers["delivered-to"],
    headers["x-original-to"]
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();

  return haystack.includes(alias.toLowerCase());
}

function decodeBase64Url(data) {
  if (!data) return "";

  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function collectBodies(part, acc = { html: [], text: [] }) {
  if (!part) return acc;

  const mimeType = String(part.mimeType || "").toLowerCase();
  const bodyData = part.body?.data;

  if (bodyData && mimeType === "text/html") {
    acc.html.push(decodeBase64Url(bodyData));
  }

  if (bodyData && mimeType === "text/plain") {
    acc.text.push(decodeBase64Url(bodyData));
  }

  for (const childPart of part.parts || []) {
    collectBodies(childPart, acc);
  }

  return acc;
}

app.get("/api/config", (req, res) => {
  res.json({
    base: `${BASE_LOCAL}@gmail.com`,
    aliasPrefix: ALIAS_PREFIX,
    inboxDays: INBOX_DAYS,
    maxResults: MAX_RESULTS
  });
});

app.post("/api/alias", (req, res) => {
  res.json({
    email: createAlias(),
    createdAt: new Date().toISOString()
  });
});

app.get("/api/messages", async (req, res, next) => {
  try {
    const alias = validateAlias(req.query.alias);
    const gmail = await getGmailClient();

    const query = `to:"${alias}" newer_than:${INBOX_DAYS}d`;

    const listResponse = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: MAX_RESULTS,
      includeSpamTrash: true
    });

    const messages = listResponse.data.messages || [];

    const detailedMessages = await Promise.all(
      messages.map(async (message) => {
        const detail = await gmail.users.messages.get({
          userId: "me",
          id: message.id,
          format: "metadata",
          metadataHeaders: [
            "From",
            "To",
            "Cc",
            "Subject",
            "Date",
            "Delivered-To",
            "X-Original-To"
          ]
        });

        const headers = headerArrayToObject(detail.data.payload?.headers);

        return {
          id: detail.data.id,
          threadId: detail.data.threadId,
          from: headers.from || "",
          to: headers.to || headers["delivered-to"] || "",
          subject: headers.subject || "(không có subject)",
          date: headers.date || "",
          snippet: detail.data.snippet || "",
          internalDate: Number(detail.data.internalDate || 0)
        };
      })
    );

    detailedMessages.sort((a, b) => b.internalDate - a.internalDate);

    res.json({
      alias,
      query,
      count: detailedMessages.length,
      messages: detailedMessages
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/messages/:id", async (req, res, next) => {
  try {
    const alias = validateAlias(req.query.alias);
    const gmail = await getGmailClient();

    const detail = await gmail.users.messages.get({
      userId: "me",
      id: req.params.id,
      format: "full"
    });

    const headers = headerArrayToObject(detail.data.payload?.headers);

    if (!messageBelongsToAlias(headers, alias)) {
      const error = new Error("Email này không thuộc alias hiện tại.");
      error.status = 403;
      throw error;
    }

    const bodies = collectBodies(detail.data.payload);

    res.json({
      id: detail.data.id,
      threadId: detail.data.threadId,
      from: headers.from || "",
      to: headers.to || headers["delivered-to"] || "",
      cc: headers.cc || "",
      subject: headers.subject || "(không có subject)",
      date: headers.date || "",
      snippet: detail.data.snippet || "",
      html: bodies.html.join("\n<hr>\n"),
      text: bodies.text.join("\n\n")
    });
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  console.error(error);

  res.status(error.status || 500).json({
    error: error.message || "Internal Server Error"
  });
});

app.listen(PORT, () => {
  console.log(`Server running: http://localhost:${PORT}`);
});
```

## 8. Tạo file `public/index.html`

```html
<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Gmail Alias Inbox</title>

  <style>
    :root {
      --bg: #0b63f6;
      --bg-dark: #0748b8;
      --card: #ffffff;
      --muted: #64748b;
      --text: #0f172a;
      --line: #dbeafe;
      --danger: #dc2626;
      --shadow: 0 24px 70px rgba(0, 0, 0, 0.22);
      --radius: 24px;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      font-family: Arial, Helvetica, sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(255,255,255,0.24), transparent 32rem),
        linear-gradient(135deg, var(--bg), var(--bg-dark));
    }

    .page {
      width: min(1120px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 32px 0;
    }

    .title {
      color: white;
      margin-bottom: 20px;
    }

    .title h1 {
      margin: 0 0 8px;
      font-size: clamp(28px, 5vw, 48px);
      letter-spacing: -0.04em;
    }

    .title p {
      margin: 0;
      opacity: 0.9;
      font-size: 16px;
    }

    .address-card {
      background: rgba(255, 255, 255, 0.96);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      padding: 22px;
      display: grid;
      grid-template-columns: 1fr auto auto;
      gap: 14px;
      align-items: center;
      margin-bottom: 22px;
    }

    .email-box {
      border: 2px solid var(--line);
      background: #eff6ff;
      border-radius: 18px;
      min-height: 58px;
      padding: 16px 18px;
      font-family: Consolas, Monaco, monospace;
      font-size: clamp(15px, 3vw, 22px);
      overflow-wrap: anywhere;
      display: flex;
      align-items: center;
    }

    button {
      border: 0;
      border-radius: 16px;
      padding: 16px 18px;
      font-weight: 800;
      cursor: pointer;
      background: #0f172a;
      color: white;
      min-height: 58px;
    }

    button.secondary {
      background: #e2e8f0;
      color: #0f172a;
    }

    button:hover {
      filter: brightness(1.08);
    }

    .inbox-card {
      background: rgba(255, 255, 255, 0.97);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      min-height: 560px;
      overflow: hidden;
      display: grid;
      grid-template-rows: auto 1fr;
    }

    .inbox-header {
      padding: 18px 22px;
      border-bottom: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
    }

    .inbox-header h2 {
      margin: 0;
      font-size: 20px;
    }

    .status {
      color: var(--muted);
      font-size: 14px;
    }

    .mail-list {
      overflow: auto;
      max-height: 620px;
    }

    .empty {
      height: 360px;
      display: grid;
      place-items: center;
      text-align: center;
      color: var(--muted);
      padding: 32px;
    }

    .mail-item {
      padding: 18px 22px;
      border-bottom: 1px solid #e2e8f0;
      cursor: pointer;
      display: grid;
      gap: 8px;
      background: white;
    }

    .mail-item:hover {
      background: #f8fafc;
    }

    .mail-top {
      display: flex;
      justify-content: space-between;
      gap: 14px;
      align-items: baseline;
    }

    .mail-subject {
      font-weight: 800;
      font-size: 16px;
    }

    .mail-date {
      color: var(--muted);
      font-size: 13px;
      white-space: nowrap;
    }

    .mail-from {
      color: #334155;
      font-size: 14px;
      overflow-wrap: anywhere;
    }

    .mail-snippet {
      color: var(--muted);
      line-height: 1.45;
    }

    .error {
      color: var(--danger);
      font-weight: 700;
    }

    .modal {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.64);
      display: none;
      align-items: center;
      justify-content: center;
      padding: 24px;
      z-index: 10;
    }

    .modal.open {
      display: flex;
    }

    .modal-panel {
      width: min(980px, 100%);
      height: min(820px, calc(100vh - 48px));
      background: white;
      border-radius: 24px;
      overflow: hidden;
      display: grid;
      grid-template-rows: auto 1fr;
      box-shadow: var(--shadow);
    }

    .modal-head {
      padding: 18px 20px;
      border-bottom: 1px solid #e2e8f0;
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 16px;
    }

    .modal-head h3 {
      margin: 0 0 8px;
      font-size: 20px;
    }

    .meta {
      color: var(--muted);
      font-size: 14px;
      display: grid;
      gap: 4px;
      overflow-wrap: anywhere;
    }

    .close-btn {
      min-height: 44px;
      padding: 10px 14px;
    }

    iframe {
      width: 100%;
      height: 100%;
      border: 0;
      background: white;
    }

    @media (max-width: 760px) {
      .address-card {
        grid-template-columns: 1fr;
      }

      button {
        width: 100%;
      }

      .mail-top {
        display: grid;
      }
    }
  </style>
</head>

<body>
  <main class="page">
    <section class="title">
      <h1>Gmail Alias Inbox</h1>
      <p>Tạo địa chỉ Gmail alias random và đọc email gửi tới alias đó.</p>
    </section>

    <section class="address-card">
      <div id="emailBox" class="email-box">Đang tạo alias...</div>
      <button id="newBtn">Tạo mới</button>
      <button id="copyBtn" class="secondary">Copy</button>
    </section>

    <section class="inbox-card">
      <div class="inbox-header">
        <div>
          <h2>Inbox</h2>
          <div id="status" class="status">Đang khởi tạo...</div>
        </div>
        <button id="refreshBtn" class="secondary">Refresh</button>
      </div>

      <div id="mailList" class="mail-list">
        <div class="empty">Chưa có dữ liệu.</div>
      </div>
    </section>
  </main>

  <div id="modal" class="modal">
    <div class="modal-panel">
      <div class="modal-head">
        <div>
          <h3 id="modalSubject">(không có subject)</h3>
          <div class="meta">
            <div><b>From:</b> <span id="modalFrom"></span></div>
            <div><b>To:</b> <span id="modalTo"></span></div>
            <div><b>Date:</b> <span id="modalDate"></span></div>
          </div>
        </div>
        <button id="closeBtn" class="close-btn">Đóng</button>
      </div>

      <iframe
        id="mailFrame"
        sandbox
        referrerpolicy="no-referrer"
        title="Email content"
      ></iframe>
    </div>
  </div>

  <script>
    const state = {
      alias: localStorage.getItem("currentAlias") || ""
    };

    const emailBox = document.getElementById("emailBox");
    const newBtn = document.getElementById("newBtn");
    const copyBtn = document.getElementById("copyBtn");
    const refreshBtn = document.getElementById("refreshBtn");
    const statusEl = document.getElementById("status");
    const mailList = document.getElementById("mailList");

    const modal = document.getElementById("modal");
    const closeBtn = document.getElementById("closeBtn");
    const modalSubject = document.getElementById("modalSubject");
    const modalFrom = document.getElementById("modalFrom");
    const modalTo = document.getElementById("modalTo");
    const modalDate = document.getElementById("modalDate");
    const mailFrame = document.getElementById("mailFrame");

    function setStatus(text, isError = false) {
      statusEl.textContent = text;
      statusEl.className = isError ? "status error" : "status";
    }

    function setAlias(alias) {
      state.alias = alias;
      localStorage.setItem("currentAlias", alias);
      emailBox.textContent = alias;
    }

    async function api(path, options = {}) {
      const response = await fetch(path, options);
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      return data;
    }

    async function createAlias() {
      setStatus("Đang tạo alias mới...");
      const data = await api("/api/alias", {
        method: "POST"
      });

      setAlias(data.email);
      await loadMessages();
    }

    function formatDate(message) {
      if (message.internalDate) {
        return new Date(message.internalDate).toLocaleString("vi-VN");
      }

      if (message.date) {
        const parsed = new Date(message.date);
        if (!Number.isNaN(parsed.getTime())) {
          return parsed.toLocaleString("vi-VN");
        }
      }

      return "";
    }

    function renderMessages(messages) {
      mailList.innerHTML = "";

      if (!messages.length) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.innerHTML = `
          <div>
            <b>Chưa có email.</b><br>
            Gửi thử một email tới alias phía trên rồi bấm Refresh.
          </div>
        `;
        mailList.appendChild(empty);
        return;
      }

      for (const message of messages) {
        const item = document.createElement("article");
        item.className = "mail-item";

        const top = document.createElement("div");
        top.className = "mail-top";

        const subject = document.createElement("div");
        subject.className = "mail-subject";
        subject.textContent = message.subject || "(không có subject)";

        const date = document.createElement("div");
        date.className = "mail-date";
        date.textContent = formatDate(message);

        const from = document.createElement("div");
        from.className = "mail-from";
        from.textContent = message.from || "(không rõ người gửi)";

        const snippet = document.createElement("div");
        snippet.className = "mail-snippet";
        snippet.textContent = message.snippet || "";

        top.appendChild(subject);
        top.appendChild(date);

        item.appendChild(top);
        item.appendChild(from);
        item.appendChild(snippet);

        item.addEventListener("click", () => openMessage(message.id));

        mailList.appendChild(item);
      }
    }

    async function loadMessages() {
      if (!state.alias) {
        await createAlias();
        return;
      }

      setStatus("Đang tải inbox...");

      const data = await api(
        `/api/messages?alias=${encodeURIComponent(state.alias)}`
      );

      renderMessages(data.messages || []);
      setStatus(`Đang xem ${data.count || 0} email cho alias hiện tại.`);
    }

    function escapeHtml(value) {
      return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }

    async function openMessage(id) {
      setStatus("Đang mở email...");

      const message = await api(
        `/api/messages/${encodeURIComponent(id)}?alias=${encodeURIComponent(state.alias)}`
      );

      modalSubject.textContent = message.subject || "(không có subject)";
      modalFrom.textContent = message.from || "";
      modalTo.textContent = message.to || "";
      modalDate.textContent = message.date || "";

      const fallbackText = `
        <pre style="white-space:pre-wrap;font-family:Arial,Helvetica,sans-serif;line-height:1.55;">
${escapeHtml(message.text || message.snippet || "")}
        </pre>
      `;

      const body = message.html || fallbackText;

      mailFrame.srcdoc = `
        <!doctype html>
        <html>
          <head>
            <meta charset="utf-8">
            <base target="_blank">
            <style>
              body {
                margin: 24px;
                font-family: Arial, Helvetica, sans-serif;
                line-height: 1.55;
                color: #0f172a;
              }

              img {
                max-width: 100%;
                height: auto;
              }

              table {
                max-width: 100%;
              }

              a {
                color: #0b63f6;
              }
            </style>
          </head>
          <body>
            ${body}
          </body>
        </html>
      `;

      modal.classList.add("open");
      setStatus("Email đã mở.");
    }

    async function copyAlias() {
      if (!state.alias) return;

      await navigator.clipboard.writeText(state.alias);
      setStatus("Đã copy alias vào clipboard.");
    }

    function closeModal() {
      modal.classList.remove("open");
      mailFrame.srcdoc = "";
    }

    newBtn.addEventListener("click", () => {
      createAlias().catch((error) => setStatus(error.message, true));
    });

    copyBtn.addEventListener("click", () => {
      copyAlias().catch((error) => setStatus(error.message, true));
    });

    refreshBtn.addEventListener("click", () => {
      loadMessages().catch((error) => setStatus(error.message, true));
    });

    closeBtn.addEventListener("click", closeModal);

    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        closeModal();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeModal();
      }
    });

    loadMessages().catch((error) => setStatus(error.message, true));

    setInterval(() => {
      loadMessages().catch((error) => setStatus(error.message, true));
    }, 10000);
  </script>
</body>
</html>
```

## 9. Cài đặt và chạy

```bash
npm install
cp .env.example .env
```

Sửa `.env`, sau đó chạy OAuth:

```bash
npm run auth
```

Trình duyệt sẽ mở để bạn đăng nhập Gmail và cấp quyền đọc mail.

Chạy server:

```bash
npm run dev
```

Mở:

```txt
http://localhost:3000
```

## 10. Test

Ví dụ app tạo alias:

```txt
your.real.account+tempmabc123@gmail.com
```

Gửi email test tới địa chỉ đó.

Sau vài giây, email sẽ hiện trong khung inbox. Click vào email để đọc nội dung. Nếu email có HTML, app sẽ render HTML trong `iframe sandbox`.

## Ghi chú bảo mật

Không public server này ra Internet nếu chưa thêm authentication riêng. Backend đang có quyền đọc Gmail của tài khoản đã OAuth, nên để hở ra ngoài thì đúng kiểu treo chìa khóa nhà lên bảng quảng cáo.

HTML email được render trong:

```html
<iframe sandbox referrerpolicy="no-referrer"></iframe>
```

Cách này chặn script trong email HTML. Tuy nhiên ảnh remote trong email vẫn có thể gọi về server ngoài. Nếu cần mức bảo mật cao hơn, hãy sanitize HTML bằng DOMPurify phía backend hoặc proxy/block toàn bộ ảnh remote.

## Giới hạn kỹ thuật

- Không tạo được inbox `random@gmail.com` thật.
- Chỉ tạo alias dạng `gmailcuaban+random@gmail.com`.
- Email vẫn nằm trong Gmail thật của bạn.
- Gmail API có quota, đừng refresh mỗi 100 ms như thể đang benchmark một nỗi thất vọng.
- Một số dịch vụ không chấp nhận dấu `+` trong email khi đăng ký. Đó là vấn đề của họ, không phải của toán học.
````2
