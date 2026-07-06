import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { io } from "socket.io-client";
import "./styles.css";

const PRODUCTION_API_URL = "https://to-do-list-2-3kqc.onrender.com";
const isLocalHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const configuredApiUrl = String(import.meta.env.VITE_API_URL || "").trim().replace(/\/$/, "");
const API_BASE = isLocalHost ? "" : configuredApiUrl || PRODUCTION_API_URL;
const categories = ["Work", "Personal", "Shopping", "Fitness", "Study"];
const priorities = ["High", "Medium", "Low"];

function getStoredUser() {
  try {
    return JSON.parse(sessionStorage.getItem("todo_user") || "null");
  } catch {
    return null;
  }
}

async function request(path, options = {}, token) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 20000);
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      signal: controller.signal
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Server response timed out. Please try again.");
    }
    throw new Error("Could not reach the server. Make sure the backend is running.");
  } finally {
    window.clearTimeout(timeout);
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || `Request failed with status ${response.status}`);
  }

  return data;
}

function SecureInput({
  label,
  name,
  value,
  onChange,
  visible,
  onToggle,
  type = "password",
  className = "",
  ...props
}) {
  const inputType = visible ? "text" : type;

  return (
    <label className="field">
      <span>{label}</span>
      <div className="secure-field">
        <input
          className={`input ${className}`}
          type={inputType}
          name={name}
          value={value}
          onChange={onChange}
          {...props}
        />
        <button
          className="eye-btn"
          onClick={onToggle}
          type="button"
          title={visible ? "Hide" : "Show"}
          aria-label={visible ? "Hide value" : "Show value"}
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
    </label>
  );
}

function AuthPage({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [otp, setOtp] = useState("");
  const [twoFactorEmail, setTwoFactorEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showOtp, setShowOtp] = useState(false);

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");

    try {
      if (mode === "login") {
        const data = await request("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ email: form.email, password: form.password })
        });
        if (data.requiresTwoFactor) {
          setTwoFactorEmail(data.email || form.email);
          setMessage(data.message);
          setOtp("");
        } else {
          onLogin(data.token, data.user);
        }
      } else {
        const data = await request("/api/auth/signup", {
          method: "POST",
          body: JSON.stringify(form)
        });
        setMessage(data.message);
        setForm({ name: "", email: "", password: "" });
        setMode("login");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function verifyLogin(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");

    try {
      const data = await request("/api/auth/verify-login", {
        method: "POST",
        body: JSON.stringify({ email: twoFactorEmail, otp })
      });
      onLogin(data.token, data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function resendVerification() {
    const email = window.prompt("Enter your registered email");
    if (!email) return;

    setMessage("");
    setError("");

    try {
      const data = await request("/api/auth/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email })
      });
      setMessage(data.message);
    } catch (err) {
      setError(err.message);
    }
  }

  if (twoFactorEmail) {
    return (
      <main className="app-shell">
        <section className="auth-layout">
          <div className="brand-panel">
            <p className="eyebrow">Andnetics secure access</p>
            <h1>Confirm it is really you.</h1>
            <p className="lead">
              We sent a 6-digit verification code to {twoFactorEmail}. Enter it to complete your protected sign-in.
            </p>
            <div className="trust-card">
              <strong>Two-step verification</strong>
              <span>Codes expire in 10 minutes and help keep your workspace private.</span>
            </div>
          </div>

          <div className="panel">
            <div className="panel-heading">
              <span>Step 2 of 2</span>
              <h2>Verify login</h2>
            </div>
            <form className="form" onSubmit={verifyLogin}>
              <SecureInput
                label="Login code"
                value={otp}
                onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                visible={showOtp}
                onToggle={() => setShowOtp((current) => !current)}
                type="password"
                className="otp-input"
                inputMode="numeric"
                pattern="[0-9]{6}"
                autoComplete="one-time-code"
                placeholder="000000"
                required
              />

              <button className="btn" disabled={loading || otp.length !== 6} type="submit">
                {loading ? "Verifying..." : "Verify and login"}
              </button>
              <button
                className="btn secondary"
                disabled={loading}
                onClick={() => {
                  setTwoFactorEmail("");
                  setOtp("");
                  setMessage("");
                  setError("");
                }}
                type="button"
              >
                Back to login
              </button>
            </form>

            {message && <div className="message">{message}</div>}
            {error && <div className="message error">{error}</div>}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
        <section className="auth-layout">
          <div className="brand-panel">
          <p className="eyebrow">Task diary</p>
          <h1>Plan work clearly. Finish tasks calmly.</h1>
          <p className="lead">
            A secure task workspace by Andnetics for reminders, priorities, categories, and focused execution.
          </p>
          <div className="stat-row">
            <div className="stat"><strong>Quick</strong><span>task capture</span></div>
            <div className="stat"><strong>Due</strong><span>date reminders</span></div>
            <div className="stat"><strong>Focus</strong><span>priority planning</span></div>
            <div className="stat"><strong>Done</strong><span>progress tracking</span></div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <span>Welcome to Andnetics</span>
            <h2>{mode === "login" ? "Sign in securely" : "Create your account"}</h2>
          </div>
          <div className="tabs">
            <button className={`tab ${mode === "login" ? "active" : ""}`} onClick={() => setMode("login")} type="button">
              Login
            </button>
            <button className={`tab ${mode === "signup" ? "active" : ""}`} onClick={() => setMode("signup")} type="button">
              Sign up
            </button>
          </div>

          <form className="form" onSubmit={submit}>
            {mode === "signup" && (
              <label className="field">
                <span>Name</span>
                <input className="input" name="name" value={form.name} onChange={updateField} autoComplete="name" required />
              </label>
            )}

            <label className="field">
              <span>Email</span>
              <input className="input" type="email" name="email" value={form.email} onChange={updateField} autoComplete="email" required />
            </label>

            <SecureInput
              label="Password"
              name="password"
              value={form.password}
              onChange={updateField}
              visible={showPassword}
              onToggle={() => setShowPassword((current) => !current)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength="6"
              required
            />

            <button className="btn" disabled={loading} type="submit">
              {loading ? "Please wait..." : mode === "login" ? "Continue" : "Create account"}
            </button>
          </form>

          {mode === "login" && (
            <p className="small-note">
              Email not verified? <button className="link-btn" onClick={resendVerification} type="button">Resend verification</button>
            </p>
          )}

          {message && <div className="message">{message}</div>}
          {error && <div className="message error">{error}</div>}
        </div>
      </section>
    </main>
  );
}

function VerifyPage({ onBack }) {
  const [status, setStatus] = useState("Checking your verification link...");
  const [error, setError] = useState("");

  useEffect(() => {
    const token = window.location.pathname.split("/verify/")[1];

    async function verify() {
      try {
        const data = await request(`/api/auth/verify/${token}`);
        setStatus(data.message);
        window.history.replaceState({}, "", "/");
      } catch (err) {
        setError(err.message);
      }
    }

    verify();
  }, []);

  return (
    <main className="app-shell">
      <section className="panel verify-panel">
        <p className="eyebrow">Email verification</p>
        <h2>Account verification</h2>
        <div className={`message ${error ? "error" : ""}`}>{error || status}</div>
        <button className="btn" onClick={onBack} type="button">Go to login</button>
      </section>
    </main>
  );
}

function Dashboard({ token, user, onLogout }) {
  const [todos, setTodos] = useState([]);
  const [newTodo, setNewTodo] = useState({
    text: "",
    dueDate: "",
    category: "Personal",
    priority: "Medium"
  });
  const [filter, setFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [error, setError] = useState("");

  const filteredTodos = useMemo(() => {
    return todos.filter((todo) => {
      const statusMatches =
        filter === "active" ? !todo.completed :
        filter === "done" ? todo.completed :
        true;
      const categoryMatches = categoryFilter === "all" || todo.category === categoryFilter;
      return statusMatches && categoryMatches;
    });
  }, [categoryFilter, filter, todos]);

  const activeCount = todos.filter((todo) => !todo.completed).length;
  const completedCount = todos.filter((todo) => todo.completed).length;
  const upcomingCount = todos.filter((todo) => todo.dueDate && !todo.completed && new Date(todo.dueDate) > new Date()).length;
  const highPriorityCount = todos.filter((todo) => todo.priority === "High" && !todo.completed).length;

  useEffect(() => {
    async function loadTodos() {
      try {
        setTodos(await request("/api/todos", {}, token));
      } catch (err) {
        setError(err.message);
        if (err.message.toLowerCase().includes("login") || err.message.toLowerCase().includes("session")) {
          onLogout();
        }
      }
    }

    loadTodos();
  }, [token, onLogout]);

  useEffect(() => {
    const socket = io(API_BASE || window.location.origin, {
      auth: { token }
    });

    socket.on("todo:created", (todo) => {
      setTodos((current) => current.some((item) => item._id === todo._id) ? current : [todo, ...current]);
    });
    socket.on("todo:updated", (todo) => {
      setTodos((current) => current.map((item) => item._id === todo._id ? todo : item));
    });
    socket.on("todo:deleted", (id) => {
      setTodos((current) => current.filter((todo) => todo._id !== id));
    });

    return () => socket.disconnect();
  }, [token]);

  useEffect(() => {
    if (!("Notification" in window)) return undefined;

    if (Notification.permission === "default") {
      Notification.requestPermission();
    }

    const timers = todos
      .filter((todo) => todo.dueDate && !todo.completed)
      .map((todo) => {
        const delay = new Date(todo.dueDate).getTime() - Date.now();
        if (delay <= 0 || delay > 2147483647) return null;

        return window.setTimeout(() => {
          if (Notification.permission === "granted") {
            new Notification("Todo reminder", {
              body: `${todo.text} is due now`
            });
          }
        }, delay);
      })
      .filter(Boolean);

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [todos]);

  async function addTodo(event) {
    event.preventDefault();
    const value = newTodo.text.trim();
    if (!value) return;

    try {
      const todo = await request("/api/todos", {
        method: "POST",
        body: JSON.stringify({
          ...newTodo,
          text: value,
          dueDate: newTodo.dueDate ? new Date(newTodo.dueDate).toISOString() : ""
        })
      }, token);
      setTodos((current) => current.some((item) => item._id === todo._id) ? current : [todo, ...current]);
      setNewTodo({
        text: "",
        dueDate: "",
        category: "Personal",
        priority: "Medium"
      });
    } catch (err) {
      setError(err.message);
    }
  }

  async function updateTodo(id, patch) {
    try {
      const todo = await request(`/api/todos/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch)
      }, token);
      setTodos((current) => current.map((item) => item._id === id ? todo : item));
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteTodo(id) {
    try {
      await request(`/api/todos/${id}`, { method: "DELETE" }, token);
      setTodos((current) => current.filter((todo) => todo._id !== id));
    } catch (err) {
      setError(err.message);
    }
  }

  function formatDueDate(value) {
    if (!value) return "No reminder";
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  }

  return (
    <main className="workspace">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="logo-mark">T</span>
          <div>
            <strong>Task Diary</strong>
            <small>{user?.name || "My workspace"}</small>
          </div>
        </div>

        <nav className="side-section">
          <span className="side-label">Views</span>
          {[
            { id: "all", label: "All tasks", count: todos.length },
            { id: "active", label: "Active", count: activeCount },
            { id: "done", label: "Completed", count: completedCount }
          ].map((item) => (
            <button
              className={`side-link ${filter === item.id ? "active" : ""}`}
              key={item.id}
              onClick={() => setFilter(item.id)}
              type="button"
            >
              <span>{item.label}</span>
              <strong>{item.count}</strong>
            </button>
          ))}
        </nav>

        <nav className="side-section">
          <span className="side-label">Categories</span>
          <button
            className={`side-link ${categoryFilter === "all" ? "active" : ""}`}
            onClick={() => setCategoryFilter("all")}
            type="button"
          >
            <span>All categories</span>
            <strong>{todos.length}</strong>
          </button>
          {categories.map((category) => (
            <button
              className={`side-link ${categoryFilter === category ? "active" : ""}`}
              key={category}
              onClick={() => setCategoryFilter(category)}
              type="button"
            >
              <span>{category}</span>
              <strong>{todos.filter((todo) => todo.category === category).length}</strong>
            </button>
          ))}
        </nav>

        <div className="side-stats">
          <div><strong>{upcomingCount}</strong><span>Upcoming</span></div>
          <div><strong>{highPriorityCount}</strong><span>High priority</span></div>
        </div>

        <button className="btn secondary logout-btn" onClick={onLogout} type="button">Logout</button>
      </aside>

      <section className="content-shell">
        <header className="content-header">
          <div>
            <p className="eyebrow">Full screen planner</p>
            <h1>Today&apos;s Tasks</h1>
            <p>{activeCount} active, {completedCount} completed, {todos.length} total</p>
          </div>
        </header>

        <form className="todo-form" onSubmit={addTodo}>
          <input
            className="input task-input"
            value={newTodo.text}
            onChange={(event) => setNewTodo((current) => ({ ...current, text: event.target.value }))}
            placeholder="Add a new task"
            maxLength="300"
            autoComplete="off"
            required
          />
          <select
            className="input"
            value={newTodo.category}
            onChange={(event) => setNewTodo((current) => ({ ...current, category: event.target.value }))}
          >
            {categories.map((category) => <option key={category}>{category}</option>)}
          </select>
          <select
            className="input"
            value={newTodo.priority}
            onChange={(event) => setNewTodo((current) => ({ ...current, priority: event.target.value }))}
          >
            {priorities.map((priority) => <option key={priority}>{priority}</option>)}
          </select>
          <input
            className="input"
            type="datetime-local"
            value={newTodo.dueDate}
            onChange={(event) => setNewTodo((current) => ({ ...current, dueDate: event.target.value }))}
          />
          <button className="btn" type="submit">Add Task</button>
        </form>

        {error && <div className="message error">{error}</div>}

        <div className="list-header">
          <strong>{filteredTodos.length} task{filteredTodos.length === 1 ? "" : "s"} shown</strong>
          <span>Task emails are sent on add, delete, 5 minutes before due, and 1 minute before due.</span>
        </div>

        <div className="todo-list">
          {filteredTodos.length === 0 ? (
            <div className="empty">No tasks here yet.</div>
          ) : filteredTodos.map((todo) => (
            <article className={`todo ${todo.completed ? "done" : ""}`} key={todo._id}>
              <button
                className="check"
                onClick={() => updateTodo(todo._id, { completed: !todo.completed })}
                title="Toggle complete"
                type="button"
              />
              <div className="todo-content">
                <div className="todo-text">{todo.text}</div>
                <div className="todo-meta">
                  <span className={`priority ${String(todo.priority || "Medium").toLowerCase()}`}>{todo.priority || "Medium"}</span>
                  <span>{todo.category || "Personal"}</span>
                  <span>{formatDueDate(todo.dueDate)}</span>
                </div>
              </div>
              <div className="todo-actions">
                <button
                  className="icon-btn"
                  onClick={() => {
                    const nextText = window.prompt("Update task", todo.text);
                    if (nextText !== null) updateTodo(todo._id, { text: nextText });
                  }}
                  title="Edit"
                  type="button"
                >
                  E
                </button>
                <button
                  className="icon-btn danger-icon"
                  onClick={() => {
                    if (window.confirm("Delete this task?")) deleteTodo(todo._id);
                  }}
                  title="Delete"
                  type="button"
                >
                  X
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function App() {
  localStorage.removeItem("todo_token");
  localStorage.removeItem("todo_user");

  const [token, setToken] = useState(sessionStorage.getItem("todo_token"));
  const [user, setUser] = useState(getStoredUser);
  const [isVerifyRoute, setIsVerifyRoute] = useState(window.location.pathname.startsWith("/verify/"));

  function login(nextToken, nextUser) {
    sessionStorage.setItem("todo_token", nextToken);
    sessionStorage.setItem("todo_user", JSON.stringify(nextUser));
    setToken(nextToken);
    setUser(nextUser);
  }

  function logout() {
    sessionStorage.removeItem("todo_token");
    sessionStorage.removeItem("todo_user");
    setToken(null);
    setUser(null);
  }

  if (isVerifyRoute) {
    return <VerifyPage onBack={() => setIsVerifyRoute(false)} />;
  }

  if (token) {
    return <Dashboard token={token} user={user} onLogout={logout} />;
  }

  return <AuthPage onLogin={login} />;
}

createRoot(document.getElementById("root")).render(<App />);
