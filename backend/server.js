const express = require("express");
const fs = require("fs");
const http = require("http");
const path = require("path");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { Server } = require("socket.io");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 5000;
const CLIENT_URL = (process.env.CLIENT_URL || "http://localhost:5173").replace(/\/$/, "");
const EXTRA_CLIENT_URLS = (process.env.FRONTEND_URLS || "")
  .split(",")
  .map((url) => url.trim().replace(/\/$/, ""))
  .filter(Boolean);
const ALLOW_ALL_ORIGINS = EXTRA_CLIENT_URLS.includes("*") || process.env.CORS_ALLOW_ALL_ORIGINS === "true";
const JWT_SECRET = process.env.JWT_SECRET;
const MONGO_URL = process.env.MONGO_URL;

if (!JWT_SECRET || !MONGO_URL || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
  console.warn("Missing one or more required .env values: MONGO_URL, JWT_SECRET, EMAIL_USER, EMAIL_PASS");
}

const allowedOrigins = new Set([
  CLIENT_URL,
  ...EXTRA_CLIENT_URLS,
  `http://localhost:${PORT}`,
  `http://127.0.0.1:${PORT}`,
  "http://localhost:5173",
  "http://127.0.0.1:5173"
]);

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (ALLOW_ALL_ORIGINS) return true;
  if (allowedOrigins.has(origin)) return true;

  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost"
      || hostname === "127.0.0.1"
      || hostname.endsWith(".vercel.app")
      || hostname.endsWith(".onrender.com");
  } catch {
    return false;
  }
}

app.use(cors({
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true
}));

app.use(express.json({ limit: "1mb" }));

const io = new Server(server, {
  cors: {
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true
  }
});

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  password: { type: String, required: true },
  isVerified: { type: Boolean, default: false },
  verificationToken: String,
  verificationTokenExpiresAt: Date,
  loginOtpHash: String,
  loginOtpExpiresAt: Date,
  loginOtpAttempts: { type: Number, default: 0 }
}, { timestamps: true });

const todoSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  text: { type: String, required: true, trim: true, maxlength: 300 },
  dueDate: Date,
  category: { type: String, default: "Personal", trim: true, maxlength: 40 },
  priority: { type: String, enum: ["High", "Medium", "Low"], default: "Medium" },
  completed: { type: Boolean, default: false },
  reminderFiveSent: { type: Boolean, default: false },
  reminderOneSent: { type: Boolean, default: false }
}, { timestamps: true });

const User = mongoose.model("User", userSchema);
const Todo = mongoose.model("Todo", todoSchema);

const transporter = nodemailer.createTransport({
  service: "gmail",
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const BRAND_NAME = "Task Diary";
const COMPANY_NAME = "Andnetics";

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function emailLayout({ preheader, title, body, ctaLabel, ctaUrl }) {
  return `
    <div style="display:none;max-height:0;overflow:hidden;color:transparent">${escapeHtml(preheader)}</div>
    <div style="margin:0;padding:32px 18px;background:#eef5f2;font-family:Arial,sans-serif;color:#17202a">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto">
        <tr>
          <td style="padding:0;border-radius:22px;overflow:hidden;background:#ffffff;box-shadow:0 22px 54px rgba(19,42,36,.14)">
            <div style="padding:28px;background:linear-gradient(135deg,#0f766e,#115e59 55%,#7c3aed);color:#ffffff">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <div style="display:inline-block;width:44px;height:44px;line-height:44px;text-align:center;border-radius:14px;background:rgba(255,255,255,.18);font-size:22px;font-weight:900">T</div>
                  </td>
                  <td style="text-align:right;vertical-align:middle">
                    <div style="font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;opacity:.86">${COMPANY_NAME}</div>
                    <div style="font-size:22px;font-weight:900">${BRAND_NAME}</div>
                  </td>
                </tr>
              </table>
              <h1 style="margin:28px 0 0;font-size:30px;line-height:1.18;color:#ffffff">${escapeHtml(title)}</h1>
            </div>
            <div style="padding:30px">
              <div style="font-size:15px;line-height:1.75;color:#40534d">${body}</div>
              ${ctaLabel && ctaUrl ? `
                <p style="margin:28px 0 4px">
                  <a href="${ctaUrl}" style="display:inline-block;padding:14px 20px;border-radius:12px;background:#0f766e;color:#ffffff;text-decoration:none;font-weight:900;box-shadow:0 10px 24px rgba(15,118,110,.24)">${escapeHtml(ctaLabel)}</a>
                </p>
              ` : ""}
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:18px 4px 0;color:#66756f;font-size:13px;line-height:1.6;text-align:center">
            <p style="margin:0">Thanks,<br><strong style="color:#15231f">Team ${COMPANY_NAME}</strong></p>
            <p style="margin:12px auto 0;max-width:480px">This is an automated message from ${BRAND_NAME}. Please do not share passwords, OTPs, or security codes with anyone.</p>
          </td>
        </tr>
      </table>
    </div>
  `;
}

function createJWT(userId) {
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: "7d" });
}

function createVerificationToken() {
  return {
    token: crypto.randomBytes(32).toString("hex"),
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24)
  };
}

function createLoginOtp() {
  const otp = crypto.randomInt(100000, 1000000).toString();

  return {
    otp,
    hash: crypto.createHash("sha256").update(otp).digest("hex"),
    expiresAt: new Date(Date.now() + 1000 * 60 * 10)
  };
}

async function sendMailWithTimeout(mailOptions) {
  const timeoutMs = 12000;
  let timeoutId;

  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error("Email service timed out. Please try again in a minute."));
    }, timeoutMs);
  });

  try {
    return await Promise.race([transporter.sendMail(mailOptions), timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
}

function getPublicUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email
  };
}

async function sendVerificationEmail(user, token) {
  const verifyLink = `${CLIENT_URL}/verify/${token}`;

  await sendMailWithTimeout({
    from: `"${BRAND_NAME} by ${COMPANY_NAME}" <${process.env.EMAIL_USER}>`,
    to: user.email,
    subject: "Verify your email for Task Diary",
    html: emailLayout({
      preheader: "Activate your Task Diary account securely.",
      title: "Confirm your email address",
      ctaLabel: "Verify Email",
      ctaUrl: verifyLink,
      body: `
        <p style="margin:0 0 12px">Hi ${escapeHtml(user.name)},</p>
        <p style="margin:0 0 12px">Welcome to ${BRAND_NAME}. Please verify your email address to activate your account and start managing your tasks securely.</p>
        <div style="margin:18px 0;padding:14px 16px;border-radius:14px;background:#f4f7f6;border:1px solid #dce6e2">
          <strong style="display:block;color:#15231f;margin-bottom:4px">Secure verification</strong>
          <span>This verification link will expire in 24 hours.</span>
        </div>
      `
    })
  });
}

async function sendLoginOtpEmail(user, otp) {
  await sendMailWithTimeout({
    from: `"${BRAND_NAME} Security" <${process.env.EMAIL_USER}>`,
    to: user.email,
    subject: "Your secure login code",
    html: emailLayout({
      preheader: "Use this 6-digit code to complete your login.",
      title: "Two-step verification code",
      body: `
        <p style="margin:0 0 12px">Hi ${escapeHtml(user.name)},</p>
        <p style="margin:0 0 16px">Use the code below to complete your login to ${BRAND_NAME}.</p>
        <div style="padding:18px;border-radius:16px;background:linear-gradient(135deg,#eef4f2,#f7f3ff);border:1px solid #dce6e2;text-align:center;font-size:38px;font-weight:900;letter-spacing:10px;color:#0f766e">${otp}</div>
        <p style="margin:16px 0 0">This code expires in 10 minutes. If you did not request it, you can safely ignore this email.</p>
      `
    })
  });
}

function formatEmailDate(value) {
  if (!value) return "No due date";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata"
  }).format(new Date(value));
}

function todoDetailsHtml(todo) {
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;margin-top:16px;border-collapse:separate;border-spacing:0 8px">
      <tr><td colspan="2" style="padding:16px;border-radius:14px;background:#f4f7f6;border:1px solid #dce6e2"><div style="color:#66756f;font-size:12px;font-weight:800;text-transform:uppercase">Task</div><div style="margin-top:4px;color:#15231f;font-size:17px;font-weight:900">${escapeHtml(todo.text)}</div></td></tr>
      <tr>
        <td style="width:50%;padding:13px;border-radius:14px;background:#fff7ed;border:1px solid #fed7aa"><div style="color:#9a3412;font-size:12px;font-weight:800;text-transform:uppercase">Priority</div><div style="margin-top:4px;color:#15231f;font-weight:800">${escapeHtml(todo.priority || "Medium")}</div></td>
        <td style="width:50%;padding:13px;border-radius:14px;background:#eff6ff;border:1px solid #bfdbfe"><div style="color:#1d4ed8;font-size:12px;font-weight:800;text-transform:uppercase">Category</div><div style="margin-top:4px;color:#15231f;font-weight:800">${escapeHtml(todo.category || "Personal")}</div></td>
      </tr>
      <tr><td colspan="2" style="padding:13px;border-radius:14px;background:#f7f3ff;border:1px solid #ddd6fe"><div style="color:#6d28d9;font-size:12px;font-weight:800;text-transform:uppercase">Due date</div><div style="margin-top:4px;color:#15231f;font-weight:800">${escapeHtml(formatEmailDate(todo.dueDate))}</div></td></tr>
    </table>
  `;
}

async function sendTaskEmail(user, subject, heading, todo, note) {
  if (!user || !user.email) return;

  await sendMailWithTimeout({
    from: `"${BRAND_NAME} Notifications" <${process.env.EMAIL_USER}>`,
    to: user.email,
    subject,
    html: emailLayout({
      preheader: note || heading,
      title: heading,
      body: `
        <p style="margin:0 0 12px">Hi ${escapeHtml(user.name)},</p>
        ${note ? `<p style="margin:0 0 12px">${escapeHtml(note)}</p>` : ""}
        ${todoDetailsHtml(todo)}
      `
    })
  });
}

async function sendTaskCreatedEmail(user, todo) {
  await sendTaskEmail(user, "Task created successfully", "Your task has been created", todo, "We have saved this task in your workspace.");
}

async function sendTaskDeletedEmail(user, todo) {
  await sendTaskEmail(user, "Task deleted from your workspace", "Your task has been deleted", todo, "This task has been removed from your workspace.");
}

async function sendTaskReminderEmail(user, todo, minutesLeft) {
  await sendTaskEmail(
    user,
    `Upcoming task: due in ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}`,
    "Upcoming task reminder",
    todo,
    `This task is due in ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}. Please review it on time.`
  );
}

async function checkDueTaskEmails() {
  const now = new Date();
  const sixMinutesFromNow = new Date(now.getTime() + 6 * 60 * 1000);

  const todos = await Todo.find({
    completed: false,
    dueDate: { $gt: now, $lte: sixMinutesFromNow },
    $or: [
      { reminderFiveSent: false },
      { reminderOneSent: false },
      { reminderFiveSent: { $exists: false } },
      { reminderOneSent: { $exists: false } }
    ]
  });

  for (const todo of todos) {
    const msLeft = new Date(todo.dueDate).getTime() - Date.now();
    const user = await User.findById(todo.userId);

    if (msLeft <= 5 * 60 * 1000 && msLeft > 4 * 60 * 1000 && !todo.reminderFiveSent) {
      await sendTaskReminderEmail(user, todo, 5);
      todo.reminderFiveSent = true;
      await todo.save();
    }

    if (msLeft <= 60 * 1000 && msLeft > 0 && !todo.reminderOneSent) {
      await sendTaskReminderEmail(user, todo, 1);
      todo.reminderOneSent = true;
      await todo.save();
    }
  }
}

function startReminderScheduler() {
  setInterval(() => {
    checkDueTaskEmails().catch((error) => {
      console.log("Reminder email error:", error.message);
    });
  }, 30000);
}

function auth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Login required" });
  }

  try {
    const token = header.split(" ")[1];
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ message: "Session expired. Please login again." });
  }
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/api", (req, res) => {
  res.json({
    ok: true,
    service: "Task Diary API",
    company: "Andnetics"
  });
});

app.post("/api/auth/signup", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email and password are required" });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({ message: "Please enter a valid email address" });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(400).json({ message: "Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const verification = createVerificationToken();

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      verificationToken: verification.token,
      verificationTokenExpiresAt: verification.expiresAt
    });

    try {
      await sendVerificationEmail(user, verification.token);
    } catch (emailError) {
      await User.deleteOne({ _id: user._id });
      return res.status(502).json({
        message: `Account was not created because verification email could not be sent: ${emailError.message}`
      });
    }

    return res.status(201).json({ message: "Signup successful. Please check your email to verify your account." });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: "Email already exists" });
    }
    return res.status(500).json({ message: error.message });
  }
});

app.post("/api/auth/resend-verification", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "No account found with this email" });
    }

    if (user.isVerified) {
      return res.status(400).json({ message: "This email is already verified" });
    }

    const verification = createVerificationToken();
    user.verificationToken = verification.token;
    user.verificationTokenExpiresAt = verification.expiresAt;
    await user.save();

    await sendVerificationEmail(user, verification.token);
    return res.json({ message: "Verification email sent again" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.get("/api/auth/verify/:token", async (req, res) => {
  try {
    const user = await User.findOne({ verificationToken: req.params.token });

    if (!user) {
      return res.status(400).json({ message: "Invalid verification link" });
    }

    if (user.verificationTokenExpiresAt && user.verificationTokenExpiresAt < new Date()) {
      return res.status(400).json({ message: "Verification link expired. Please request a new one." });
    }

    user.isVerified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpiresAt = undefined;
    await user.save();

    return res.json({ message: "Email verified successfully. Now you can login." });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    if (!user.isVerified) {
      return res.status(403).json({ message: "Please verify your email first" });
    }

    const loginOtp = createLoginOtp();
    user.loginOtpHash = loginOtp.hash;
    user.loginOtpExpiresAt = loginOtp.expiresAt;
    user.loginOtpAttempts = 0;
    await user.save();

    try {
      await sendLoginOtpEmail(user, loginOtp.otp);
    } catch (emailError) {
      user.loginOtpHash = undefined;
      user.loginOtpExpiresAt = undefined;
      user.loginOtpAttempts = 0;
      await user.save();
      return res.status(502).json({
        message: `Login code could not be sent: ${emailError.message}`
      });
    }

    return res.json({
      message: "Password verified. A 6-digit login code has been sent to your email.",
      requiresTwoFactor: true,
      email: user.email
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.post("/api/auth/verify-login", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const otp = String(req.body.otp || "").trim();

    if (!email || !otp) {
      return res.status(400).json({ message: "Email and login code are required" });
    }

    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({ message: "Enter a valid 6-digit login code" });
    }

    const user = await User.findOne({ email });
    if (!user || !user.loginOtpHash || !user.loginOtpExpiresAt) {
      return res.status(400).json({ message: "Login code not found. Please login again." });
    }

    if (user.loginOtpExpiresAt < new Date()) {
      user.loginOtpHash = undefined;
      user.loginOtpExpiresAt = undefined;
      user.loginOtpAttempts = 0;
      await user.save();
      return res.status(400).json({ message: "Login code expired. Please login again." });
    }

    if (user.loginOtpAttempts >= 5) {
      user.loginOtpHash = undefined;
      user.loginOtpExpiresAt = undefined;
      user.loginOtpAttempts = 0;
      await user.save();
      return res.status(429).json({ message: "Too many wrong attempts. Please login again." });
    }

    const otpHash = crypto.createHash("sha256").update(otp).digest("hex");
    if (otpHash !== user.loginOtpHash) {
      user.loginOtpAttempts += 1;
      await user.save();
      return res.status(400).json({ message: "Invalid login code" });
    }

    user.loginOtpHash = undefined;
    user.loginOtpExpiresAt = undefined;
    user.loginOtpAttempts = 0;
    await user.save();

    return res.json({
      message: "Login successful",
      token: createJWT(user._id),
      user: getPublicUser(user)
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.get("/api/auth/me", auth, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  return res.json({ user: getPublicUser(user) });
});

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (!token) {
      return next(new Error("Socket authentication failed"));
    }
    const user = jwt.verify(token, JWT_SECRET);
    socket.userId = user.id;
    return next();
  } catch {
    return next(new Error("Socket authentication failed"));
  }
});

io.on("connection", (socket) => {
  socket.join(socket.userId);
});

app.get("/api/todos", auth, async (req, res) => {
  const todos = await Todo.find({ userId: req.user.id }).sort({ createdAt: -1 });
  return res.json(todos);
});

app.post("/api/todos", auth, async (req, res) => {
  const text = String(req.body.text || "").trim();
  if (!text) {
    return res.status(400).json({ message: "Todo text is required" });
  }

  const dueDate = req.body.dueDate ? new Date(req.body.dueDate) : undefined;
  if (dueDate && Number.isNaN(dueDate.getTime())) {
    return res.status(400).json({ message: "Invalid due date" });
  }

  const todo = await Todo.create({
    userId: req.user.id,
    text,
    dueDate,
    category: String(req.body.category || "Personal").trim() || "Personal",
    priority: ["High", "Medium", "Low"].includes(req.body.priority) ? req.body.priority : "Medium"
  });

  const user = await User.findById(req.user.id);
  sendTaskCreatedEmail(user, todo).catch((error) => {
    console.log("Task created email error:", error.message);
  });

  io.to(req.user.id).emit("todo:created", todo);
  return res.status(201).json(todo);
});

app.patch("/api/todos/:id", auth, async (req, res) => {
  const update = {};

  if (typeof req.body.text === "string") {
    update.text = req.body.text.trim();
  }

  if (typeof req.body.completed === "boolean") {
    update.completed = req.body.completed;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "dueDate")) {
    update.dueDate = req.body.dueDate ? new Date(req.body.dueDate) : undefined;
    if (update.dueDate && Number.isNaN(update.dueDate.getTime())) {
      return res.status(400).json({ message: "Invalid due date" });
    }
    update.reminderFiveSent = false;
    update.reminderOneSent = false;
  }

  if (typeof req.body.category === "string") {
    update.category = req.body.category.trim() || "Personal";
  }

  if (["High", "Medium", "Low"].includes(req.body.priority)) {
    update.priority = req.body.priority;
  }

  if (Object.prototype.hasOwnProperty.call(update, "text") && !update.text) {
    return res.status(400).json({ message: "Todo text cannot be empty" });
  }

  const todo = await Todo.findOneAndUpdate(
    { _id: req.params.id, userId: req.user.id },
    update,
    { new: true, runValidators: true }
  );

  if (!todo) {
    return res.status(404).json({ message: "Todo not found" });
  }

  io.to(req.user.id).emit("todo:updated", todo);
  return res.json(todo);
});

app.delete("/api/todos/:id", auth, async (req, res) => {
  const todo = await Todo.findOneAndDelete({
    _id: req.params.id,
    userId: req.user.id
  });

  if (!todo) {
    return res.status(404).json({ message: "Todo not found" });
  }

  const user = await User.findById(req.user.id);
  sendTaskDeletedEmail(user, todo).catch((error) => {
    console.log("Task deleted email error:", error.message);
  });

  io.to(req.user.id).emit("todo:deleted", req.params.id);
  return res.json({ message: "Todo deleted" });
});

const frontendPath = path.join(__dirname, "..", "frontend", "dist");
const frontendIndexPath = path.join(frontendPath, "index.html");
const hasFrontendBuild = fs.existsSync(frontendIndexPath);

if (hasFrontendBuild) {
  app.use(express.static(frontendPath));
}

app.get(/^\/(?!api).*/, (req, res, next) => {
  if (!hasFrontendBuild) {
    if (path.extname(req.path)) {
      return res.status(404).send("Static asset not found. This Render service is running the API only.");
    }

    return res.json({
      ok: true,
      service: "Task Diary API",
      company: "Andnetics",
      message: "Backend is running. Open the Vercel frontend URL to use the app."
    });
  }

  if (path.extname(req.path)) {
    return res.status(404).send("Static asset not found. Rebuild the frontend and redeploy.");
  }

  res.sendFile(frontendIndexPath, (error) => {
    if (error) {
      return res.status(503).send("Frontend build not found. Run `npm run build` from the project root before starting the server.");
    }
    return undefined;
  });
});

mongoose.connect(MONGO_URL)
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`React dev frontend should run at ${CLIENT_URL}`);
      startReminderScheduler();
    });
  })
  .catch((error) => {
    console.log("MongoDB error:", error.message);
  });
