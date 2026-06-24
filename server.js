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
  const cleaned = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  return cleaned || "temp";
}

function createAlias() {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(5).toString("hex");
  const tag = `${ALIAS_PREFIX}${timestamp}${random}`;

  return `${BASE_LOCAL}+${tag}@gmail.com`;
}

function validateAlias(rawAlias) {
  const alias = String(rawAlias || "")
    .trim()
    .toLowerCase();

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

  const normalized = data
    .replace(/-/g, "+")
    .replace(/_/g, "/");

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
