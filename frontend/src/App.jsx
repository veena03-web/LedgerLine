
import { useEffect, useState } from "react";
import "./App.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

function App() {
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [user, setUser] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");
  const [mode, setMode] = useState("login");
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: ""
  });

  const [transfer, setTransfer] = useState({
    sourceAccountId: "",
    destinationAccountId: "",
    amount: ""
  });

  const [deposit, setDeposit] = useState({
    destinationAccountId: "",
    amount: ""
  });

  async function request(path, options = {}, currentToken = token) {
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {}),
        ...(options.headers || {})
      }
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.message || data.error || "Request failed");
    }

    return data;
  }

  function notify(text, type = "success") {
    setMessage(text);
    setMessageType(type);
  }

  async function loadAccounts(currentToken = token, role = user?.role) {
    try {
      const endpoint =
        role === "ADMIN"
          ? "/api/accounts/admin/all"
          : "/api/accounts";

      const response = await fetch(`${API}${endpoint}`, {
        headers: {
          Authorization: `Bearer ${currentToken}`
        }
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "Could not load accounts");
      }

      setAccounts(data.accounts || []);
    } catch (error) {
      notify(error.message, "error");
    }
  }

  useEffect(() => {
    if (!token) return;

    async function restoreSession() {
      try {
        const response = await fetch(`${API}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error("Session expired. Please log in again.");
        }

        const restoredUser = data.user || data;
        setUser(restoredUser);
        await loadAccounts(token, restoredUser.role);
      } catch (error) {
        localStorage.removeItem("token");
        setToken("");
        setUser(null);
        setAccounts([]);
        notify(error.message, "error");
      }
    }

    restoreSession();
  }, []);

  async function authenticate(e) {
    e.preventDefault();
    setLoading(true);
    notify("");

    try {
      const data = await request(
        mode === "login" ? "/api/auth/login" : "/api/auth/register",
        {
          method: "POST",
          body: JSON.stringify(form)
        },
        ""
      );

      if (mode === "register") {
        notify("Registration successful. Please log in.");
        setMode("login");
        setForm({ name: "", email: form.email, password: "" });
        return;
      }

      const accessToken = data.token || data.accessToken;

      if (!accessToken) {
        throw new Error("Login response did not contain a token.");
      }

      const loggedInUser = data.user || null;

      localStorage.setItem("token", accessToken);
      setToken(accessToken);
      setUser(loggedInUser);

      notify("Welcome to BalanceVault!");
      await loadAccounts(accessToken, loggedInUser?.role);
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function createAccount() {
    try {
      await request("/api/accounts", {
        method: "POST",
        body: JSON.stringify({})
      });

      notify("Your new account has been created.");
      await loadAccounts();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function makeTransfer(e) {
    e.preventDefault();
    setLoading(true);

    try {
      await request("/api/transactions/transfer", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          sourceAccountId: transfer.sourceAccountId,
          destinationAccountId: transfer.destinationAccountId.trim(),
          amountPaise: String(Math.round(Number(transfer.amount) * 100))
        })
      });

      notify("Transfer completed successfully.");
      setTransfer({
        sourceAccountId: "",
        destinationAccountId: "",
        amount: ""
      });

      await loadAccounts();
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function makeDeposit(e) {
    e.preventDefault();
    setLoading(true);

    try {
      await request("/api/transactions/deposit", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          destinationAccountId: deposit.destinationAccountId,
          amountPaise: String(Math.round(Number(deposit.amount) * 100))
        })
      });

      notify("Deposit completed successfully.");
      setDeposit({ destinationAccountId: "", amount: "" });

      await loadAccounts();
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem("token");
    setToken("");
    setUser(null);
    setAccounts([]);
    notify("You have been logged out.");
  }

  const isAdmin = user?.role === "ADMIN";

  const totalBalance = accounts.reduce(
    (total, account) =>
      total + Number(account.balancePaise || 0),
    0
  );

  if (!token) {
    return (
      <main className="auth-page">
        <div className="auth-decoration">
          <div className="auth-brand">
            <span className="brand-icon">B</span>
            <span>BalanceVault</span>
          </div>

          <div className="auth-promo">
            <span className="eyebrow">SMARTER MONEY MANAGEMENT</span>
            <h1>Your money.<br />Always in balance.</h1>
            <p>
              A secure financial platform built around transparency,
              reliable transactions and complete accountability.
            </p>
            <div className="auth-feature"><span>✓</span> Secure account management</div>
            <div className="auth-feature"><span>✓</span> Reliable money transfers</div>
            <div className="auth-feature"><span>✓</span> Double-entry accounting</div>
          </div>

          <p className="auth-footer">BALANCEVAULT · SECURE FINANCE</p>
        </div>

        <section className="auth-form-area">
          <div className="auth-card">
            <span className="eyebrow">YOUR FINANCIAL SPACE</span>
            <h2>{mode === "login" ? "Welcome back" : "Create an account"}</h2>
            <p className="muted">
              {mode === "login"
                ? "Log in to access your BalanceVault dashboard."
                : "Get started with your secure account."}
            </p>

            <form onSubmit={authenticate} className="form-stack">
              {mode === "register" && (
                <label>
                  Full name
                  <input
                    placeholder="Enter your full name"
                    required
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                  />
                </label>
              )}

              <label>
                Email address
                <input
                  type="email"
                  placeholder="you@example.com"
                  required
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                />
              </label>

              <label>
                Password
                <input
                  type="password"
                  placeholder="Enter your password"
                  required
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                />
              </label>

              <button className="primary-btn full-btn" disabled={loading}>
                {loading
                  ? "Please wait..."
                  : mode === "login"
                    ? "Log in to BalanceVault"
                    : "Create account"}
              </button>
            </form>

            <p className="auth-switch">
              {mode === "login"
                ? "Don't have an account?"
                : "Already have an account?"}
              <button
                className="text-btn"
                onClick={() => {
                  setMode(mode === "login" ? "register" : "login");
                  notify("");
                }}
              >
                {mode === "login" ? "Create one" : "Log in"}
              </button>
            </p>

            {message && (
              <div className={`notice ${messageType}`}>{message}</div>
            )}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">B</span>
          <span>BalanceVault</span>
        </div>

        <span className="nav-label">WORKSPACE</span>

        <nav className="side-nav">
          <a className="nav-link active" href="#overview">▦ <span>Overview</span></a>
          <a className="nav-link" href="#accounts">▣ <span>My accounts</span></a>
          {!isAdmin && (
            <a className="nav-link" href="#transfer">↗ <span>Transfer money</span></a>
          )}
          {isAdmin && (
            <a className="nav-link" href="#deposit">＋ <span>Admin deposit</span></a>
          )}
        </nav>

        <div className="sidebar-bottom">
          <div className="security-note">
            <span>♢</span>
            <strong>Secure banking</strong>
            <small>Your transactions are protected with account-level checks.</small>
          </div>
          <button className="logout-btn" onClick={logout}>↪ <span>Log out</span></button>
        </div>
      </aside>

      <section className="main-area">
        <header className="topbar">
          <div>
            <span className="eyebrow">PERSONAL FINANCE</span>
            <h2>Dashboard</h2>
          </div>

          <div className="profile">
            <div className="avatar">
              {(user?.name || user?.email || "U").charAt(0).toUpperCase()}
            </div>
            <div className="profile-info">
              <strong>{user?.name || "Account holder"}</strong>
              <small>{user?.role || "ACCOUNT HOLDER"}</small>
            </div>
          </div>
        </header>

        {message && (
          <div className={`notice ${messageType}`}>
            {message}
            <button onClick={() => setMessage("")}>×</button>
          </div>
        )}

        <section id="overview" className="welcome-section">
          <div>
            <span className="eyebrow">YOUR FINANCIAL OVERVIEW</span>
            <h1>Welcome back{user?.name ? `, ${user.name.split(" ")[0]}` : ""}.</h1>
            <p>Here's what's happening with your accounts today.</p>
          </div>

          {!isAdmin && (
            <button className="primary-btn" onClick={createAccount}>
              + Create new account
            </button>
          )}
        </section>

        <section className="summary-grid">
          <article className="summary-card balance-card">
            <span className="summary-label">
              {isAdmin ? "TOTAL CUSTOMER ACCOUNT BALANCE" : "TOTAL ACCOUNT BALANCE"}
            </span>
            <h2>₹{(totalBalance / 100).toLocaleString("en-IN", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })}</h2>
            <p>Across {accounts.length} account{accounts.length === 1 ? "" : "s"}</p>
            <span className="card-decoration">₹</span>
          </article>

          <article className="summary-card">
            <span className="summary-label">TOTAL ACCOUNTS</span>
            <h2>{accounts.length}</h2>
            <p>{isAdmin ? "Customer accounts managed" : "Your managed accounts"}</p>
            <span className="summary-icon">▣</span>
          </article>

          <article className="summary-card">
            <span className="summary-label">ACCOUNT STATUS</span>
            <h2 className="status-heading">Active</h2>
            <p>Manage your accounts securely</p>
            <span className="summary-icon">✓</span>
          </article>
        </section>

        <section id="accounts" className="content-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">{isAdmin ? "CUSTOMER ACCOUNTS" : "YOUR MONEY"}</span>
              <h2>{isAdmin ? "All customer accounts" : "My accounts"}</h2>
              <p className="muted">View account numbers and available balances.</p>
            </div>

            <button
              className="outline-btn"
              onClick={() => loadAccounts(token, user?.role)}
            >
              ↻ Refresh
            </button>
          </div>

          {accounts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">▣</div>
              <h3>No accounts found</h3>
              <p>
                {isAdmin
                  ? "Customer accounts will appear here."
                  : "Create your first account to start using BalanceVault."}
              </p>
              {!isAdmin && (
                <button className="primary-btn" onClick={createAccount}>
                  Create account
                </button>
              )}
            </div>
          ) : (
            <div className="account-grid">
              {accounts.map(account => (
                <article className="account-card" key={account.id}>
                  <div className="account-card-top">
                    <span className="account-symbol">B</span>
                    <span className={`status-pill ${String(account.status).toLowerCase()}`}>
                      {account.status}
                    </span>
                  </div>

                  <span className="account-caption">ACCOUNT NUMBER</span>
                  <strong className="account-number">{account.accountNumber}</strong>

                  <span className="account-caption">AVAILABLE BALANCE</span>
                  <h3>₹{(Number(account.balancePaise || 0) / 100).toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })}</h3>
                </article>
              ))}
            </div>
          )}
        </section>

        {!isAdmin && (
          <section id="transfer" className="content-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">MOVE MONEY</span>
                <h2>Transfer money</h2>
                <p className="muted">Send money securely from one account to another.</p>
              </div>
              <span className="panel-icon">↗</span>
            </div>

            <form onSubmit={makeTransfer} className="transaction-form">
              <label>
                From account
                <select
                  required
                  value={transfer.sourceAccountId}
                  onChange={e => setTransfer({ ...transfer, sourceAccountId: e.target.value })}
                >
                  <option value="">Choose your account</option>
                  {accounts.map(account => (
                    <option key={account.id} value={account.id}>
                      {account.accountNumber}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Destination account ID
                <input
                  required
                  placeholder="Enter recipient account ID"
                  value={transfer.destinationAccountId}
                  onChange={e => setTransfer({ ...transfer, destinationAccountId: e.target.value })}
                />
              </label>

              <label>
                Amount (₹)
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="0.00"
                  value={transfer.amount}
                  onChange={e => setTransfer({ ...transfer, amount: e.target.value })}
                />
              </label>

              <button className="primary-btn form-btn" disabled={loading}>
                {loading ? "Processing..." : "Continue transfer →"}
              </button>
            </form>

            <p className="form-footnote">
              Transfers are checked for account ownership, available balance and duplicate requests.
            </p>
          </section>
        )}

        {isAdmin && (
          <section id="deposit" className="content-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">ADMINISTRATION</span>
                <h2>Admin deposit</h2>
                <p className="muted">Add demo funds to an active customer account.</p>
              </div>
              <span className="panel-icon">＋</span>
            </div>

            <form onSubmit={makeDeposit} className="transaction-form">
              <label>
                Destination account
                <select
                  required
                  value={deposit.destinationAccountId}
                  onChange={e => setDeposit({ ...deposit, destinationAccountId: e.target.value })}
                >
                  <option value="">Choose destination account</option>
                  {accounts.map(account => (
                    <option key={account.id} value={account.id}>
                      {account.accountNumber}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Amount (₹)
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="0.00"
                  value={deposit.amount}
                  onChange={e => setDeposit({ ...deposit, amount: e.target.value })}
                />
              </label>

              <button className="primary-btn form-btn" disabled={loading}>
                {loading ? "Processing..." : "Make deposit →"}
              </button>
            </form>

            <p className="form-footnote">
              Administrator access is required. Deposits are recorded in the ledger.
            </p>
          </section>
        )}

        <footer className="page-footer">
          <span>BalanceVault</span>
          <span>Secure money movement · Double-entry accounting</span>
        </footer>
      </section>
    </main>
  );
}

export default App;
