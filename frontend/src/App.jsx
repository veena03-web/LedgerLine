import { useEffect, useState } from "react";
import "./App.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

function App() {
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [user, setUser] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });
  const [activeTab, setActiveTab] = useState("overview");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");
  const [mode, setMode] = useState("login");
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [transfer, setTransfer] = useState({ sourceAccountId: "", destinationAccountId: "", amount: "" });
  const [deposit, setDeposit] = useState({ destinationAccountId: "", amount: "" });

  const [withdrawal, setWithdrawal] = useState({
  sourceAccountId: "",
  amount: ""
});

  const isAdmin = user?.role === "ADMIN";
  const isAuditor = user?.role === "AUDITOR";
  const isAccountHolder = user?.role === "ACCOUNT_HOLDER";

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
    if (!response.ok) throw new Error(data.message || data.error || "Request failed");
    return data;
  }

  function notify(text, type = "success") {
    setMessage(text);
    setMessageType(type);
  }

  async function loadAccounts(currentToken = token, role = user?.role) {
    try {
      const endpoint = role === "ADMIN" ? "/api/accounts/admin/all" : "/api/accounts";
      const data = await request(endpoint, {}, currentToken);
      setAccounts(data.accounts || []);
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function loadHistory(page = 1, currentToken = token) {
    setHistoryLoading(true);
    try {
      const data = await request(`/api/transactions/history?page=${page}&limit=10`, {}, currentToken);
      setTransactions(data.data || []);
      setPagination(data.pagination || { page, limit: 10, total: 0, totalPages: 0 });
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    async function restoreSession() {
      try {
        const data = await request("/api/auth/me", {}, token);
        const restoredUser = data.user || data;
        setUser(restoredUser);
        await loadAccounts(token, restoredUser.role);
        if (restoredUser.role === "ADMIN" || restoredUser.role === "AUDITOR") {
          await loadHistory(1, token);
        }
      } catch (error) {
        localStorage.removeItem("token");
        setToken("");
        setUser(null);
        setAccounts([]);
        notify(error.message, "error");
      }
    }
    restoreSession();
    // Restore the session once when the app mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function authenticate(e) {
    e.preventDefault();
    setLoading(true);
    notify("");
    try {
      const data = await request(
        mode === "login" ? "/api/auth/login" : "/api/auth/register",
        { method: "POST", body: JSON.stringify(form) },
        ""
      );
      if (mode === "register") {
        notify("Registration successful. Please log in.");
        setMode("login");
        setForm({ name: "", email: form.email, password: "" });
        return;
      }

      const accessToken = data.token || data.accessToken;
      if (!accessToken) throw new Error("Login response did not contain a token.");

      const loggedInUser = data.user || null;
      localStorage.setItem("token", accessToken);
      setToken(accessToken);
      setUser(loggedInUser);
      setActiveTab("overview");
      notify("Welcome to Vaultora!");
      await loadAccounts(accessToken, loggedInUser?.role);
      if (loggedInUser?.role === "ADMIN" || loggedInUser?.role === "AUDITOR") {
        await loadHistory(1, accessToken);
      }
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function createAccount() {
    setLoading(true);
    try {
      await request("/api/accounts", { method: "POST", body: JSON.stringify({}) });
      notify("Your new account has been created.");
      await loadAccounts();
      setActiveTab("accounts");
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setLoading(false);
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
      setTransfer({ sourceAccountId: "", destinationAccountId: "", amount: "" });
      await loadAccounts();
      await loadHistory(1);
      setActiveTab("history");
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
      await loadHistory(1);
      setActiveTab("history");
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setLoading(false);
    }
  }


async function makeWithdrawal(e) {
  e.preventDefault();
  setLoading(true);

  try {
    await request("/api/transactions/withdraw", {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({
        sourceAccountId: withdrawal.sourceAccountId,
        amountPaise: String(
          Math.round(Number(withdrawal.amount) * 100)
        )
      })
    });

    notify("Withdrawal completed successfully.");

    setWithdrawal({ sourceAccountId: "", amount: "" });

    await loadAccounts();
    await loadHistory(1);

    setActiveTab("history");
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
    setTransactions([]);
    setActiveTab("overview");
    notify("You have been logged out.");
  }

  const totalBalance = accounts.reduce((total, account) => total + Number(account.balancePaise || 0), 0);
  const money = (paise) => `₹${(Number(paise || 0) / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

  const navItems = [
    { id: "overview", label: "Overview", icon: "⌂", show: true },
    { id: "accounts", label: isAdmin ? "Customer accounts" : "My accounts", icon: "▤", show: true },
    { id: "transfer", label: "Transfer money", icon: "↗", show: isAccountHolder },
    { id: "withdraw", label: "Withdraw money", icon: "↓", show: isAccountHolder },
    { id: "deposit", label: "Admin deposit", icon: "＋", show: isAdmin },
    { id: "history", label: "Transactions", icon: "↻", show: true }
  ].filter((item) => item.show);

  function changeTab(tab) {
    setActiveTab(tab);
    setMessage("");
    if (tab === "history") loadHistory(1);
    if (tab === "accounts") loadAccounts(token, user?.role);
  }

  if (!token) {
    return (
      <main className="auth-page">
        <section className="auth-decoration">
          <div className="auth-brand">
            <span className="brand-icon">V</span>
            <span>Vaultora</span>
          </div>
          <div className="auth-promo">
            <span className="eyebrow">INTELLIGENT LEDGER & SECURE BANKING</span>
            <h1>Your money.<br />In safe hands.</h1>
            <p>A secure financial platform built around transparency, reliable transactions and complete accountability.</p>
            <div className="auth-feature"><span>✓</span> Secure account management</div>
            <div className="auth-feature"><span>✓</span> Reliable money transfers</div>
            <div className="auth-feature"><span>✓</span> Double-entry accounting</div>
          </div>
          <p className="auth-footer">VAULTORA · INTELLIGENT FINANCE</p>
        </section>

        <section className="auth-form-area">
          <div className="auth-card">
            <span className="eyebrow">YOUR FINANCIAL SPACE</span>
            <h2>{mode === "login" ? "Welcome back" : "Create an account"}</h2>
            <p className="muted">{mode === "login" ? "Log in to access your Vaultora dashboard." : "Get started with your secure account."}</p>
            <form onSubmit={authenticate} className="form-stack">
              {mode === "register" && (
                <label>Full name
                  <input placeholder="Enter your full name" required value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </label>
              )}
              <label>Email address
                <input type="email" placeholder="you@example.com" required value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </label>
              <label>Password
                <input type="password" placeholder="Enter your password" required value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </label>
              <button className="primary-btn full-btn" disabled={loading}>
                {loading ? "Please wait..." : mode === "login" ? "Log in to Vaultora" : "Create account"}
              </button>
            </form>
            <p className="auth-switch">
              {mode === "login" ? "Don't have an account?" : "Already have an account?"}
              <button className="text-btn" onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                notify("");
              }}>{mode === "login" ? "Create one" : "Log in"}</button>
            </p>
            {message && <div className={`notice ${messageType}`}>{message}</div>}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">V</span>
          <span>Vaultora</span>
        </div>
        <span className="nav-label">WORKSPACE</span>
        <nav className="side-nav" aria-label="Main navigation">
          {navItems.map((item) => (
            <button key={item.id} type="button"
              className={`nav-link ${activeTab === item.id ? "active" : ""}`}
              onClick={() => changeTab(item.id)}>
              <span className="nav-icon">{item.icon}</span><span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="security-note">
            <span>◇</span>
            <strong>Secure banking</strong>
            <small>Your transactions are protected with account-level checks.</small>
          </div>
          <button className="logout-btn" onClick={logout}>↪ <span>Log out</span></button>
        </div>
      </aside>

      <section className="main-area">
        <header className="topbar">
          <div>
            <span className="eyebrow">INTELLIGENT LEDGER & SECURE BANKING</span>
            <h2>{navItems.find((item) => item.id === activeTab)?.label || "Dashboard"}</h2>
          </div>
          <div className="profile">
            <div className="avatar">{(user?.name || user?.email || "U").charAt(0).toUpperCase()}</div>
            <div className="profile-info">
              <strong>{user?.name || "Account holder"}</strong>
              <small>{user?.role || "ACCOUNT HOLDER"}</small>
            </div>
          </div>
        </header>

        {message && (
          <div className={`notice ${messageType}`} role="status">
            <span>{message}</span>
            <button aria-label="Dismiss message" onClick={() => setMessage("")}>×</button>
          </div>
        )}

        <div className="mobile-tabs" aria-label="Workspace tabs">
          {navItems.map((item) => (
            <button key={item.id} type="button"
              className={activeTab === item.id ? "mobile-tab active" : "mobile-tab"}
              onClick={() => changeTab(item.id)}>
              <span>{item.icon}</span>{item.label}
            </button>
          ))}
        </div>

        {activeTab === "overview" && (
          <>
            <section className="welcome-section">
              <div>
                <span className="eyebrow">YOUR FINANCIAL OVERVIEW</span>
                <h1>Welcome back{user?.name ? `, ${user.name.split(" ")[0]}` : ""}.</h1>
                <p>Here's what's happening with your accounts today.</p>
              </div>
              {isAccountHolder && <button className="primary-btn" onClick={createAccount} disabled={loading}>＋ Create new account</button>}
            </section>
            <section className="summary-grid">
              <article className="summary-card balance-card">
                <span className="summary-label">{isAdmin ? "TOTAL CUSTOMER ACCOUNT BALANCE" : "TOTAL ACCOUNT BALANCE"}</span>
                <h2>{money(totalBalance)}</h2>
                <p>Across {accounts.length} account{accounts.length === 1 ? "" : "s"}</p>
                <span className="card-decoration">₹</span>
              </article>
              <article className="summary-card">
                <span className="summary-label">TOTAL ACCOUNTS</span>
                <h2>{accounts.length}</h2>
                <p>{isAdmin ? "Customer accounts managed" : "Accounts available to you"}</p>
                <span className="summary-icon">▤</span>
              </article>
              <article className="summary-card">
                <span className="summary-label">YOUR ACCESS</span>
                <h2 className="status-heading">{isAuditor ? "Read only" : "Active"}</h2>
                <p>{user?.role?.replace("_", " ") || "Account holder"} access</p>
                <span className="summary-icon">✓</span>
              </article>
            </section>
            <section className="content-panel">
              <div className="panel-heading">
                <div><span className="eyebrow">GET STARTED</span><h2>Quick actions</h2><p className="muted">Jump directly to the things you need.</p></div>
              </div>
              <div className="quick-actions">
                <button className="quick-action" onClick={() => changeTab("accounts")}><span>▤</span><strong>View accounts</strong><small>Check balances and status</small></button>
                {isAccountHolder && <button className="quick-action" onClick={() => changeTab("transfer")}><span>↗</span><strong>Transfer money</strong><small>Send money securely</small></button>}
                {isAccountHolder && <button className="quick-action" onClick={() => changeTab("withdraw")}><span>↓</span><strong>Withdraw money</strong><small>Withdraw from your account</small></button>}
                {isAdmin && <button className="quick-action" onClick={() => changeTab("deposit")}><span>＋</span><strong>Admin deposit</strong><small>Add funds to an account</small></button>}
                <button className="quick-action" onClick={() => changeTab("history")}><span>↻</span><strong>Transactions</strong><small>Review transaction records</small></button>
              </div>
            </section>
            <section className="content-panel">
              <div className="panel-heading">
                <div><span className="eyebrow">ACCOUNT SNAPSHOT</span><h2>{isAdmin ? "Customer accounts" : "Your accounts"}</h2></div>
                <button className="outline-btn" onClick={() => loadAccounts(token, user?.role)}>↻ Refresh</button>
              </div>
              {accounts.length === 0 ? <div className="empty-state"><div className="empty-icon">▤</div><h3>No accounts found</h3><p>{isAdmin ? "Customer accounts will appear here." : "Create your first account to get started."}</p></div> : (
                <div className="account-grid">
                  {accounts.slice(0, 3).map((account) => (
                    <article className="account-card" key={account.id}>
                      <div className="account-card-top"><span className="account-symbol">V</span><span className={`status-pill ${String(account.status).toLowerCase()}`}>{account.status}</span></div>
                      <span className="account-caption">ACCOUNT NUMBER</span><strong className="account-number">{account.accountNumber}</strong>
                      <span className="account-caption">AVAILABLE BALANCE</span><h3>{money(account.balancePaise)}</h3>
                    </article>
                  ))}
                </div>
              )}
              {accounts.length > 3 && <button className="text-btn view-all" onClick={() => changeTab("accounts")}>View all accounts →</button>}
            </section>
          </>
        )}

        {activeTab === "accounts" && (
          <section className="content-panel page-panel">
            <div className="panel-heading">
              <div><span className="eyebrow">{isAdmin ? "CUSTOMER ACCOUNTS" : "YOUR MONEY"}</span><h2>{isAdmin ? "All customer accounts" : "My accounts"}</h2><p className="muted">View account numbers, status and available balances.</p></div>
              <button className="outline-btn" onClick={() => loadAccounts(token, user?.role)}>↻ Refresh</button>
            </div>
            {accounts.length === 0 ? (
              <div className="empty-state"><div className="empty-icon">▤</div><h3>No accounts found</h3><p>{isAdmin ? "Customer accounts will appear here." : "Create your first account to get started."}</p>{isAccountHolder && <button className="primary-btn" onClick={createAccount} disabled={loading}>Create account</button>}</div>
            ) : (
              <div className="account-grid">
                {accounts.map((account) => (
                  <article className="account-card" key={account.id}>
                    <div className="account-card-top"><span className="account-symbol">V</span><span className={`status-pill ${String(account.status).toLowerCase()}`}>{account.status}</span></div>
                    <span className="account-caption">ACCOUNT NUMBER</span><strong className="account-number">{account.accountNumber}</strong>
                    <span className="account-caption">AVAILABLE BALANCE</span><h3>{money(account.balancePaise)}</h3>
                  </article>
                ))}
              </div>
            )}
            {isAccountHolder && <button className="primary-btn create-account-btn" onClick={createAccount} disabled={loading}>＋ Create new account</button>}
          </section>
        )}

        {activeTab === "transfer" && isAccountHolder && (
          <section className="content-panel page-panel transaction-panel">
            <div className="panel-heading"><div><span className="eyebrow">MOVE MONEY</span><h2>Transfer money</h2><p className="muted">Send money securely from one account to another.</p></div><span className="panel-icon">↗</span></div>
            <form onSubmit={makeTransfer} className="transaction-form">
              <label>From account
                <select required value={transfer.sourceAccountId} onChange={(e) => setTransfer({ ...transfer, sourceAccountId: e.target.value })}>
                  <option value="">Choose your account</option>
                  {accounts.map((account) => <option key={account.id} value={account.id}>{account.accountNumber} · {money(account.balancePaise)}</option>)}
                </select>
              </label>
              <label>Recipient account ID
                <input required placeholder="Enter recipient account ID" value={transfer.destinationAccountId} onChange={(e) => setTransfer({ ...transfer, destinationAccountId: e.target.value })} />
              </label>
              <label>Amount (₹)
                <input required type="number" min="0.01" step="0.01" placeholder="0.00" value={transfer.amount} onChange={(e) => setTransfer({ ...transfer, amount: e.target.value })} />
              </label>
              <button className="primary-btn form-btn" disabled={loading || accounts.length === 0}>{loading ? "Processing..." : "Continue transfer →"}</button>
            </form>
            <p className="form-footnote">Transfers are checked for account ownership, available balance and duplicate requests.</p>
          </section>
        )}


{activeTab === "withdraw" && isAccountHolder && (
  <section className="content-panel page-panel transaction-panel">
    <div className="panel-heading">
      <div>
        <span className="eyebrow">ACCOUNT SERVICES</span>
        <h2>Withdraw money</h2>
        <p className="muted">
          Withdraw funds from your available account balance.
        </p>
      </div>
      <span className="panel-icon">↓</span>
    </div>

    <form onSubmit={makeWithdrawal} className="transaction-form">
      <label>
        From account
        <select
          required
          value={withdrawal.sourceAccountId}
          onChange={(e) =>
            setWithdrawal({
              ...withdrawal,
              sourceAccountId: e.target.value
            })
          }
        >
          <option value="">Choose your account</option>

          {accounts
            .filter(
              (account) =>
                account.status === "ACTIVE" &&
                Number(account.balancePaise) > 0
            )
            .map((account) => (
              <option key={account.id} value={account.id}>
                {account.accountNumber} · {money(account.balancePaise)}
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
          value={withdrawal.amount}
          onChange={(e) =>
            setWithdrawal({
              ...withdrawal,
              amount: e.target.value
            })
          }
        />
      </label>

      <button
        className="primary-btn form-btn"
        disabled={loading || accounts.length === 0}
      >
        {loading ? "Processing..." : "Withdraw money →"}
      </button>
    </form>

    <p className="form-footnote">
      Withdrawals are checked against account ownership and available
      balance, and recorded using double-entry ledger accounting.
    </p>
  </section>
)}


        {activeTab === "deposit" && isAdmin && (
          <section className="content-panel page-panel transaction-panel">
            <div className="panel-heading"><div><span className="eyebrow">ADMINISTRATION</span><h2>Admin deposit</h2><p className="muted">Add demo funds to an active customer account.</p></div><span className="panel-icon">＋</span></div>
            <form onSubmit={makeDeposit} className="transaction-form">
              <label>Destination account
                <select required value={deposit.destinationAccountId} onChange={(e) => setDeposit({ ...deposit, destinationAccountId: e.target.value })}>
                  <option value="">Choose destination account</option>
                  {accounts.map((account) => <option key={account.id} value={account.id}>{account.accountNumber} · {account.status}</option>)}
                </select>
              </label>
              <label>Amount (₹)
                <input required type="number" min="0.01" step="0.01" placeholder="0.00" value={deposit.amount} onChange={(e) => setDeposit({ ...deposit, amount: e.target.value })} />
              </label>
              <button className="primary-btn form-btn" disabled={loading || accounts.length === 0}>{loading ? "Processing..." : "Make deposit →"}</button>
            </form>
            <p className="form-footnote">Administrator access is required. Deposits are recorded in the ledger.</p>
          </section>
        )}

        {activeTab === "history" && (
          <section className="content-panel page-panel">
            <div className="panel-heading"><div><span className="eyebrow">ACTIVITY</span><h2>Transaction history</h2><p className="muted">Review your recent posted and recorded transactions.</p></div><button className="outline-btn" onClick={() => loadHistory(1)} disabled={historyLoading}>↻ Refresh</button></div>
            {historyLoading ? <div className="empty-state"><p>Loading transactions…</p></div> : transactions.length === 0 ? (
              <div className="empty-state"><div className="empty-icon">↻</div><h3>No transactions yet</h3><p>Your transaction records will appear here.</p></div>
            ) : (
              <>
                <div className="table-wrap">
                  <table className="transaction-table">
                    <thead><tr><th>Transaction</th><th>Type</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
                    <tbody>
                      {transactions.map((tx) => (
                        <tr key={tx.id}>
                          <td><strong>{tx.description || `${tx.type} transaction`}</strong><small className="transaction-id">{tx.id}</small></td>
                          <td>{tx.type}</td><td className="amount-cell">{money(tx.amountPaise)}</td>
                          <td><span className={`status-pill ${String(tx.status).toLowerCase()}`}>{tx.status}</span></td>
                          <td>{tx.createdAt ? new Date(tx.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="pagination">
                  <span>Page {pagination.page || 1} of {Math.max(pagination.totalPages || 1, 1)} · {pagination.total || 0} records</span>
                  <div>
                    <button className="outline-btn" disabled={historyLoading || pagination.page <= 1} onClick={() => loadHistory(pagination.page - 1)}>Previous</button>
                    <button className="outline-btn" disabled={historyLoading || pagination.page >= pagination.totalPages} onClick={() => loadHistory(pagination.page + 1)}>Next</button>
                  </div>
                </div>
              </>
            )}
          </section>
        )}

        <footer className="page-footer"><span>Vaultora</span><span>Secure money movement · Double-entry accounting</span></footer>
      </section>
    </main>
  );
}

export default App;
