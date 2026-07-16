import nodemailer from "nodemailer";

export type SupplierEmailMessage = {
  supplierCode: "CMP" | "MM";
  to: string;
  subject: string;
  body: string;
};

export type SupplierEmailSender = (message: SupplierEmailMessage) => Promise<{ status: "delivered" }>;

export function createSmtpEmailSender(env: Record<string, string | undefined> = process.env): SupplierEmailSender | undefined {
  const host = env.ORDERING_SMTP_HOST?.trim();
  const user = env.ORDERING_SMTP_USER?.trim();
  const password = env.ORDERING_SMTP_PASSWORD;
  const from = env.ORDERING_SMTP_FROM?.trim() || user;
  const port = Number(env.ORDERING_SMTP_PORT || "587");

  if (!host || !user || !password || !from || !Number.isInteger(port) || port <= 0) return undefined;

  const transport = nodemailer.createTransport({
    auth: { pass: password, user },
    host,
    port,
    secure: env.ORDERING_SMTP_SECURE === "true" || port === 465
  });

  return async (message) => {
    await transport.sendMail({ from, subject: message.subject, text: message.body, to: message.to });
    return { status: "delivered" };
  };
}
