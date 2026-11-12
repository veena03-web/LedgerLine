
import { useState } from "react";
import "./App.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

function App() {
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [user, setUser] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({
    name: "", email: "", password: ""
  });
  const [transfer, setTransfer] = useState({
    sourceAccountId: "", destinationAccountId: "", amount: ""
  });
  const [deposit, setDeposit] = useState({
    destinationAccountId: "", amount: ""
  });

  async function request(path, options = {}) {
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {})
      }
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || data.error || "Request failed");
    return data;
  }

  async function authenticate(e) {
    e.preventDefault();
    setMessage("");
    try {
      const data = await request(
        mode === "login" ? "/api/auth/login" : "/api/auth/register",
        { method: "POST", body: JSON.stringify(form) }
      );

      if (mode === "register") {
        setMessage("Registration successful. Please log in.");
        setMode("login");
        return;
      }

      const accessToken = data.token || data.accessToken;
      if (!accessToken) throw new Error("Login response did not contain a token.");

      localStorage.setItem("token", accessToken);
      setToken(accessToken);
      setUser(data.user || null);
      setMessage("Login successful.");
      await loadAccounts(accessToken);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function loadAccounts(currentToken = token) {
    try {
      const response = await fetch(`${API}/api/accounts`, {
        headers: { Authorization: `Bearer ${currentToken}` }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not load accounts");
      setAccounts(Array.isArray(data) ? data : data.accounts || []);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function createAccount() {
    try {
      await request("/api/accounts", {
        method: "POST",
        body: JSON.stringify({})
      });
      setMessage("Account created successfully.");
      await loadAccounts();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function makeTransfer(e) {
    e.preventDefault();
    try {
      await request("/api/transactions/transfer", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          sourceAccountId: transfer.sourceAccountId,
          destinationAccountId: transfer.destinationAccountId,
          amountPaise: String(Math.round(Number(transfer.amount) * 100))
        })
      });
      setMessage("Transfer completed.");
      await loadAccounts();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function makeDeposit(e) {
    e.preventDefault();
    try {
      await request("/api/transactions/deposit", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          destinationAccountId: deposit.destinationAccountId,
          amountPaise: String(Math.round(Number(deposit.amount) * 100))
        })
      });
      setMessage("Deposit completed.");
      await loadAccounts();
    } catch (error) {
      setMessage(error.message);
    }
  }

  function logout() {
    localStorage.removeItem("token");
    setToken("");
    setUser(null);
    setAccounts([]);
    setMessage("Logged out.");
  }

  if (!token) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <h1>BalanceVault</h1>
          <p>Secure money movement. Every transaction accounted for.</p>
          <h2>{mode === "login" ? "Welcome back" : "Create your account"}</h2>
          <form onSubmit={authenticate}>
            {mode === "register" && (
              <input placeholder="Full name" required
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })} />
            )}
            <input type="email" placeholder="Email" required
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })} />
            <input type="password" placeholder="Password" required
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })} />
            <button>{mode === "login" ? "Log in" : "Register"}</button>
          </form>
          <button className="secondary" onClick={() => setMode(mode === "login" ? "register" : "login")}>
            {mode === "login" ? "Create an account" : "Back to login"}
          </button>
          <p>{message}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="dashboard">
      <header>
        <div><h1>BalanceVault</h1><p>Your money, accounted for.</p></div>
        <button className="secondary" onClick={logout}>Log out</button>
      </header>

      <p>{message}</p>
      <section className="panel">
        <h2>Your accounts</h2>
        <button onClick={createAccount}>+ Create account</button>
        <button className="secondary" onClick={() => loadAccounts()}>Refresh</button>
        {accounts.length === 0 && <p>No accounts found. Create your first account.</p>}
        {accounts.map(account => (
          <article className="account" key={account.id}>
            <strong>{account.accountNumber}</strong>
            <p>Balance: ₹{(Number(account.balancePaise || 0) / 100).toFixed(2)}</p>
            <small>Status: {account.status}</small>
          </article>
        ))}
      </section>

      <section className="panel">
        <h2>Transfer money</h2>
        <form onSubmit={makeTransfer}>
          <select required value={transfer.sourceAccountId}
            onChange={e => setTransfer({ ...transfer, sourceAccountId: e.target.value })}>
            <option value="">Select source account</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.accountNumber}</option>)}
          </select>
          <input required placeholder="Destination account ID"
            value={transfer.destinationAccountId}
            onChange={e => setTransfer({ ...transfer, destinationAccountId: e.target.value })} />
          <input required type="number" min="0.01" step="0.01" placeholder="Amount in ₹"
            value={transfer.amount}
            onChange={e => setTransfer({ ...transfer, amount: e.target.value })} />
          <button>Transfer</button>
        </form>
      </section>

      <section className="panel">
        <h2>Admin deposit</h2>
        <form onSubmit={makeDeposit}>
          <select required value={deposit.destinationAccountId}
            onChange={e => setDeposit({ ...deposit, destinationAccountId: e.target.value })}>
            <option value="">Select destination account</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.accountNumber}</option>)}
          </select>
          <input required type="number" min="0.01" step="0.01" placeholder="Amount in ₹"
            value={deposit.amount}
            onChange={e => setDeposit({ ...deposit, amount: e.target.value })} />
          <button>Deposit</button>
        </form>
        <small>Admin access is required for deposits.</small>
      </section>
    </main>
  );
}

export default App;
