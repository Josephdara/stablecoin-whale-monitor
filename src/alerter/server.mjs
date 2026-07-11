import express from "express";
import nodemailer from "nodemailer";
import { Storage } from "@google-cloud/storage";
import { loadAlerterConfig, loadDotEnv } from "../config.mjs";
import { parseNdjson } from "../storage/ndjson.mjs";
import { formatAlertEmail, selectAlertEvents } from "./alert.mjs";

loadDotEnv();
const config = loadAlerterConfig();
const bucket = new Storage().bucket(config.gcsEventsBucket);
const transport = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: { user: config.emailFrom, pass: config.gmailAppPassword },
});

const app = express();
app.use(express.json());

app.get("/healthz", (_request, response) => response.json({ status: "ok" }));

app.post("/pubsub", async (request, response, next) => {
  try {
    const objectName = request.body?.message?.attributes?.objectId ?? "";
    if (!objectName.startsWith("ethereum/ranges/") || !objectName.endsWith(".json")) {
      return response.status(204).end();
    }
    const [contents] = await bucket.file(objectName).download();
    const qualifying = selectAlertEvents(parseNdjson(contents.toString("utf8")), config.alertMinimumAmount);
    if (qualifying.length) {
      const { subject, text } = formatAlertEmail(qualifying, config.alertMinimumAmount);
      await transport.sendMail({ from: config.emailFrom, to: config.emailTo, subject, text });
    }
    console.error(JSON.stringify({ level: "info", message: "Alert batch processed", objectName, qualifying: qualifying.length }));
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.use((error, _request, response, _next) => {
  console.error(JSON.stringify({ level: "error", message: "Alert processing failed", error: error.message }));
  response.status(500).json({ error: "alert processing failed" });
});

app.listen(config.port, config.host, () => {
  console.error(JSON.stringify({ level: "info", message: "Alerter listening", host: config.host, port: config.port }));
});
