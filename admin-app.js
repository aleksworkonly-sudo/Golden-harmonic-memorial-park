const {
  useState,
  useEffect,
  useCallback,
  useRef
} = React;

// ── Product defaults (matches site.jsx BASE_TIERS) ─────────────────────────
const PLAN_TERMS = [{
  key: 'cash',
  label: 'Spot Cash',
  months: 0,
  surcharge: 0
}, {
  key: '1yr',
  label: '1-Year Plan',
  months: 12,
  surcharge: 0.10
}, {
  key: '2yr',
  label: '2-Year Plan',
  months: 24,
  surcharge: 0.15
}, {
  key: '3yr',
  label: '3-Year Plan',
  months: 36,
  surcharge: 0.20
}, {
  key: '5yr',
  label: '5-Year Plan',
  months: 60,
  surcharge: 0.30
}];
const BASE_TIERS = [{
  id: 'regular',
  name: 'Regular Plot',
  category: 'Regular Plots',
  price: 30000,
  sortOrder: 1,
  desc: 'A standard single-interment lot in our open-lawn sections.',
  features: ['1 interment space', 'Perpetual care included', 'Open-lawn setting']
}, {
  id: 'premium',
  name: 'Premium Plot',
  category: 'Regular Plots',
  price: 42500,
  sortOrder: 2,
  desc: 'An upgraded standard plot in one of the park\'s preferred sections.',
  features: ['1 interment space', 'Perpetual care included', 'Preferred section placement']
}, {
  id: 'corner-premium',
  name: 'Corner Premium Plot',
  category: 'Regular Plots',
  price: 47500,
  sortOrder: 3,
  desc: 'A corner plot in our most requested standard section.',
  features: ['1 interment space', 'Perpetual care included', 'Corner placement']
}, {
  id: 'garden-regular',
  name: 'Regular Garden Plot',
  category: 'Garden Plots',
  price: 37500,
  sortOrder: 4,
  desc: 'A single-interment lot within our landscaped garden sections.',
  features: ['1 interment space', 'Perpetual care included', 'Garden setting']
}, {
  id: 'garden-premium',
  name: 'Premium Garden Plot',
  category: 'Garden Plots',
  price: 47500,
  sortOrder: 5,
  desc: 'An upgraded garden plot in a preferred section of the garden.',
  features: ['1 interment space', 'Perpetual care included', 'Preferred garden section']
}, {
  id: 'garden-corner',
  name: 'Corner Prime Garden Plot',
  category: 'Garden Plots',
  price: 57500,
  sortOrder: 6,
  desc: 'A corner plot in our most requested garden section.',
  features: ['1 interment space', 'Perpetual care included', 'Prime corner placement']
}, {
  id: 'family-vault',
  name: 'Family Vault Package',
  category: 'Family Vault',
  price: 105000,
  sortOrder: 7,
  desc: 'An apartment-style below-ground vault holding 3 coffins in one plot.',
  features: ['3 coffins in one plot', 'Apartment-style below-ground vault', 'Payment plans available (surcharge applies)']
}];
const fmt = n => '₱' + Math.round(n).toLocaleString('en-PH');
const initials = name => name ? name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2) : '??';
const fmtDate = ts => {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

// ── Toast ──────────────────────────────────────────────────────────────────
function Toast({
  msg,
  onDone
}) {
  useEffect(() => {
    const t = setTimeout(onDone, 2800);
    return () => clearTimeout(t);
  }, []);
  return /*#__PURE__*/React.createElement("div", {
    className: "toast"
  }, msg);
}

// ── Login ──────────────────────────────────────────────────────────────────
// Verifies a 6-digit TOTP code against a base32 secret using the OTPAuth
// library (loaded via CDN in admin.html). window:1 accepts the previous and
// next 30-second window too, so a slightly-off phone clock still works.
function verifyTotpCode(base32Secret, code) {
  try {
    const totp = new OTPAuth.TOTP({
      issuer: 'Golden Harmonic',
      label: 'GH Admin',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(base32Secret)
    });
    const delta = totp.validate({
      token: (code || '').trim(),
      window: 1
    });
    return delta !== null;
  } catch (ex) {
    console.error('[GH totp] verify failed', ex);
    return false;
  }
}
function Login({
  onLogin
}) {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  // Once password sign-in succeeds, if that account has 2FA on we hold here
  // instead of calling onLogin — pendingUser is signed in to Firebase Auth
  // already, but the app won't render the Dashboard until the code checks out.
  const [pendingUser, setPendingUser] = useState(null);
  const [totpSecret, setTotpSecret] = useState(null);
  const [code, setCode] = useState('');
  const [totpErr, setTotpErr] = useState('');
  const [totpBusy, setTotpBusy] = useState(false);
  const submit = async e => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const cred = await window.auth.signInWithEmailAndPassword(email, pass);
      const udoc = await window.db.collection('users').doc(cred.user.uid).get();
      const data = udoc.exists ? udoc.data() : null;
      if (data && data.totpEnabled && data.totpSecret) {
        setTotpSecret(data.totpSecret);
        setPendingUser(cred.user);
      } else {
        onLogin(cred.user);
      }
    } catch (ex) {
      console.error('[GH login]', ex.code, ex.message, ex);
      const map = {
        'auth/invalid-email': 'That email address looks malformed.',
        'auth/user-not-found': 'No account found with that email.',
        'auth/wrong-password': 'Wrong password for that account.',
        'auth/invalid-credential': 'Email or password is incorrect.',
        'auth/operation-not-allowed': 'Email/Password sign-in is not enabled for this project yet — enable it in Firebase Console → Authentication → Sign-in method.',
        'auth/too-many-requests': 'Too many attempts — wait a bit and try again.',
        'auth/network-request-failed': 'Network error — check your internet connection.'
      };
      setErr(map[ex.code] || `${ex.code || 'Error'}: ${ex.message || 'Could not sign in.'}`);
    } finally {
      setBusy(false);
    }
  };
  const submitTotp = e => {
    e.preventDefault();
    setTotpErr('');
    setTotpBusy(true);
    // Purely local/synchronous check, but keep the busy state briefly so
    // rapid repeat taps on "Verify" can't hammer the check in a tight loop.
    setTimeout(() => {
      if (verifyTotpCode(totpSecret, code)) {
        onLogin(pendingUser);
      } else {
        setTotpErr('That code is wrong or expired. Check your authenticator app and try again.');
        setCode('');
      }
      setTotpBusy(false);
    }, 150);
  };
  const cancelTotp = () => {
    window.auth.signOut();
    setPendingUser(null);
    setTotpSecret(null);
    setCode('');
    setTotpErr('');
    setPass('');
  };
  if (pendingUser) {
    return /*#__PURE__*/React.createElement("div", {
      className: "login-wrap"
    }, /*#__PURE__*/React.createElement("div", {
      className: "login-card"
    }, /*#__PURE__*/React.createElement("div", {
      className: "login-logo"
    }, /*#__PURE__*/React.createElement("div", {
      className: "login-mark"
    }, "🔒"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      className: "login-title"
    }, "Two-factor check"), /*#__PURE__*/React.createElement("div", {
      className: "login-sub"
    }, pendingUser.email))), /*#__PURE__*/React.createElement("form", {
      onSubmit: submitTotp
    }, /*#__PURE__*/React.createElement("div", {
      className: "login-field"
    }, /*#__PURE__*/React.createElement("label", null, "6-digit code from your authenticator app"), /*#__PURE__*/React.createElement("input", {
      type: "text",
      inputMode: "numeric",
      autoComplete: "one-time-code",
      autoFocus: true,
      required: true,
      maxLength: 6,
      placeholder: "123456",
      style: {
        letterSpacing: '4px',
        fontSize: 18,
        textAlign: 'center'
      },
      value: code,
      onChange: e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
    })), /*#__PURE__*/React.createElement("button", {
      className: "login-btn",
      type: "submit",
      disabled: totpBusy || code.length !== 6
    }, totpBusy ? 'Checking…' : 'Verify →'), totpErr && /*#__PURE__*/React.createElement("p", {
      className: "login-err"
    }, totpErr), /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: cancelTotp,
      style: {
        width: '100%',
        marginTop: 14,
        background: 'none',
        border: 'none',
        color: 'var(--ink-3)',
        fontSize: 12,
        textDecoration: 'underline'
      }
    }, "Not you? Sign out and start over"))));
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "login-wrap"
  }, /*#__PURE__*/React.createElement("div", {
    className: "login-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "login-logo"
  }, /*#__PURE__*/React.createElement("img", {
    src: "/logo-header.png",
    alt: "Golden Harmonic logo",
    style: {
      width: 44,
      height: 44,
      objectFit: 'contain',
      flexShrink: 0
    }
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "login-title"
  }, "Golden Harmonic"), /*#__PURE__*/React.createElement("div", {
    className: "login-sub"
  }, "Memorial Park · Admin Panel"))), /*#__PURE__*/React.createElement("form", {
    onSubmit: submit
  }, /*#__PURE__*/React.createElement("div", {
    className: "login-field"
  }, /*#__PURE__*/React.createElement("label", null, "Email address"), /*#__PURE__*/React.createElement("input", {
    type: "email",
    required: true,
    placeholder: "admin@ghmemorialpark.com",
    value: email,
    onChange: e => setEmail(e.target.value)
  })), /*#__PURE__*/React.createElement("div", {
    className: "login-field"
  }, /*#__PURE__*/React.createElement("label", null, "Password"), /*#__PURE__*/React.createElement("input", {
    type: "password",
    required: true,
    placeholder: "••••••••",
    value: pass,
    onChange: e => setPass(e.target.value)
  })), /*#__PURE__*/React.createElement("button", {
    className: "login-btn",
    type: "submit",
    disabled: busy
  }, busy ? 'Signing in…' : 'Sign in →'), err && /*#__PURE__*/React.createElement("p", {
    className: "login-err"
  }, err))));
}

// ── Trash / Recently Deleted helpers ────────────────────────────────────────
// Soft-delete: move the doc's data into a `trash` collection (keyed so re-deleting
// the same doc just overwrites its trash entry) before removing the original,
// so staff have a backup/recovery point in the admin panel.
async function moveToTrash(collectionName, id, data, actorEmail) {
  await window.db.collection('trash').doc(`${collectionName}_${id}`).set({
    collection: collectionName,
    originalId: id,
    data,
    deletedAt: Date.now(),
    deletedBy: actorEmail || 'unknown'
  });
  await window.db.collection(collectionName).doc(id).delete();
}

// ── Inquiries panel ────────────────────────────────────────────────────────
function Inquiries({
  currentUser
}) {
  const [rows, setRows] = useState(null);
  const [toast, setToast] = useState('');
  const [selected, setSelected] = useState({});
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    return window.db.collection('inquiries').orderBy('createdAt', 'desc').onSnapshot(snap => setRows(snap.docs.map(d => ({
      _id: d.id,
      ...d.data()
    }))));
  }, []);
  const updateStatus = async (id, status) => {
    await window.db.collection('inquiries').doc(id).update({
      status
    });
    setToast('Status updated');
  };
  const deleteOne = async (id, name) => {
    if (!confirm(`Delete inquiry from ${name || 'this contact'}? It will be moved to Recently Deleted.`)) return;
    const doc = rows.find(r => r._id === id);
    const {
      _id,
      ...data
    } = doc || {};
    await moveToTrash('inquiries', id, data, currentUser && currentUser.email);
    setSelected(s => {
      const n = {
        ...s
      };
      delete n[id];
      return n;
    });
    setToast('Inquiry moved to Recently Deleted');
  };
  const selectedIds = Object.keys(selected).filter(id => selected[id]);
  const toggleOne = id => setSelected(s => ({
    ...s,
    [id]: !s[id]
  }));
  const toggleAll = () => {
    if (rows && selectedIds.length === rows.length) setSelected({});else setSelected(Object.fromEntries((rows || []).map(r => [r._id, true])));
  };
  const deleteSelected = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Delete ${selectedIds.length} selected inquir${selectedIds.length === 1 ? 'y' : 'ies'}? They'll be moved to Recently Deleted.`)) return;
    setDeleting(true);
    try {
      for (const id of selectedIds) {
        const doc = rows.find(r => r._id === id);
        const {
          _id,
          ...data
        } = doc || {};
        await moveToTrash('inquiries', id, data, currentUser && currentUser.email);
      }
      setSelected({});
      setToast(`${selectedIds.length} inquiries moved to Recently Deleted`);
    } finally {
      setDeleting(false);
    }
  };
  const statusClass = s => ({
    new: 'badge-new',
    contacted: 'badge-contacted',
    converted: 'badge-converted',
    closed: 'badge-closed'
  })[s] || 'badge-new';
  if (!rows) return /*#__PURE__*/React.createElement("div", {
    className: "loading"
  }, /*#__PURE__*/React.createElement("div", {
    className: "spinner"
  }), /*#__PURE__*/React.createElement("div", null, "Loading inquiries…"));
  return /*#__PURE__*/React.createElement(React.Fragment, null, toast && /*#__PURE__*/React.createElement(Toast, {
    msg: toast,
    onDone: () => setToast('')
  }), /*#__PURE__*/React.createElement("div", {
    className: "section-hd"
  }, /*#__PURE__*/React.createElement("h2", null, "Inquiries ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--ink-3)',
      fontWeight: 400,
      fontSize: 13
    }
  }, "(", rows.length, ")")), selectedIds.length > 0 && /*#__PURE__*/React.createElement("button", {
    className: "btn btn-danger btn-sm",
    disabled: deleting,
    onClick: deleteSelected
  }, deleting ? 'Deleting…' : `🗑 Delete selected (${selectedIds.length})`)), /*#__PURE__*/React.createElement("div", {
    className: "table-card"
  }, rows.length === 0 ? /*#__PURE__*/React.createElement("div", {
    className: "empty"
  }, "No inquiries yet. When someone fills out the brochure form on your website, it will appear here.") : /*#__PURE__*/React.createElement("table", {
    className: "gh-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    style: {
      width: 30
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: rows.length > 0 && selectedIds.length === rows.length,
    onChange: toggleAll
  })), /*#__PURE__*/React.createElement("th", null, "Name"), /*#__PURE__*/React.createElement("th", null, "Email"), /*#__PURE__*/React.createElement("th", null, "Phone"), /*#__PURE__*/React.createElement("th", null, "Interest"), /*#__PURE__*/React.createElement("th", null, "Date"), /*#__PURE__*/React.createElement("th", null, "Status"), /*#__PURE__*/React.createElement("th", null))), /*#__PURE__*/React.createElement("tbody", null, rows.map(r => /*#__PURE__*/React.createElement("tr", {
    key: r._id
  }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: !!selected[r._id],
    onChange: () => toggleOne(r._id)
  })), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("strong", null, r.fullName || `${r.firstName} ${r.lastName}`)), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("a", {
    href: `mailto:${r.email}`,
    style: {
      color: 'var(--green)'
    }
  }, r.email)), /*#__PURE__*/React.createElement("td", null, r.phone), /*#__PURE__*/React.createElement("td", {
    style: {
      maxWidth: 160,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, r.interest), /*#__PURE__*/React.createElement("td", {
    style: {
      color: 'var(--ink-3)'
    }
  }, fmtDate(r.createdAt)), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("select", {
    className: "status-sel",
    value: r.status || 'new',
    onChange: e => updateStatus(r._id, e.target.value)
  }, /*#__PURE__*/React.createElement("option", {
    value: "new"
  }, "New"), /*#__PURE__*/React.createElement("option", {
    value: "contacted"
  }, "Contacted"), /*#__PURE__*/React.createElement("option", {
    value: "converted"
  }, "Converted"), /*#__PURE__*/React.createElement("option", {
    value: "closed"
  }, "Closed"))), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-danger btn-sm",
    onClick: () => deleteOne(r._id, r.fullName || `${r.firstName} ${r.lastName}`)
  }, "Delete"))))))));
}

// ── Customers panel ────────────────────────────────────────────────────────
function planBalance(c) {
  if (!c.plan) return null;
  const paid = (c.payments || []).reduce((s, p) => s + Number(p.amount || 0), 0);
  const price = Number(c.plan.price) || 0;
  return {
    price,
    paid,
    balance: Math.max(0, price - paid),
    pct: price ? Math.min(100, paid / price * 100) : 0
  };
}
function totalPaid(c) {
  return (c.payments || []).reduce((s, p) => s + Number(p.amount || 0), 0);
}

// ── CRM pipeline stages ──────────────────────────────────────────────────────
const STAGES = [{
  id: 'new',
  label: 'New Lead'
}, {
  id: 'contacted',
  label: 'Contacted'
}, {
  id: 'site_visit',
  label: 'Site Visit'
}, {
  id: 'negotiating',
  label: 'Negotiating'
}, {
  id: 'won',
  label: 'Won'
}, {
  id: 'lost',
  label: 'Lost'
}];
const STAGE_LABEL = Object.fromEntries(STAGES.map(s => [s.id, s.label]));
// Old status values from before the pipeline existed — map them forward so
// nothing "disappears" for customers created before this feature shipped.
const LEGACY_STATUS_MAP = {
  lead: 'new',
  active: 'contacted',
  converted: 'won',
  closed: 'lost'
};
function normalizeStage(status) {
  return STAGE_LABEL[status] ? status : LEGACY_STATUS_MAP[status] || 'new';
}
function isOverdue(dateStr) {
  if (!dateStr) return false;
  return new Date(dateStr + 'T23:59:59') < new Date();
}
function isDueToday(dateStr) {
  if (!dateStr) return false;
  return dateStr === new Date().toISOString().slice(0, 10);
}
async function changeStage(customerId, newStage, actorEmail) {
  await window.db.collection('customers').doc(customerId).update({
    status: newStage,
    notes: firebase.firestore.FieldValue.arrayUnion({
      type: 'system',
      text: `Moved to "${STAGE_LABEL[newStage]}"`,
      author: actorEmail || 'system',
      createdAt: Date.now()
    })
  });
}
// ── Plot Management ──────────────────────────────────────────────────────
// PLACEHOLDER block list — replace with Golden Harmonic's real blocks,
// sizes and product tiers once confirmed. `productId` must match an id
// in the `products` collection (Products tab) so each block's plot type
// stays tied to the pricing already managed there.
const PLOT_BLOCKS = [{
  id: '1',
  label: 'Block 1',
  size: 600,
  productId: 'regular'
}, {
  id: '2',
  label: 'Block 2',
  size: 450,
  productId: 'premium'
}, {
  id: '3',
  label: 'Block 3',
  size: 520,
  productId: 'garden-regular'
}, {
  id: '4',
  label: 'Block 4',
  size: 400,
  productId: 'corner-premium'
}, {
  id: '5',
  label: 'Block 5',
  size: 480,
  productId: 'garden-premium'
}, {
  id: '6',
  label: 'Block 6',
  size: 380,
  productId: 'garden-corner'
}, {
  id: '9',
  label: 'Block 9',
  size: 120,
  productId: 'family-vault',
  unitLabel: 'Unit'
}];
const PLOT_PAGE_SIZE = 200;
function plotCode(block, n) {
  return `${block.id}-${String(n).padStart(4, '0')}`;
}
// A plot doc only exists once a slot is reserved or sold — anything
// without a doc is implicitly available, so we never have to seed
// thousands of "available" rows up front.
function plotStatus(doc) {
  return doc ? doc.status === 'occupied' ? 'occupied' : 'reserved' : 'available';
}
const plotEl = React.createElement;
function PlotManagement({
  currentUser,
  customers,
  onOpenCustomer,
  onToast
}) {
  const [products, setProducts] = useState([]);
  useEffect(() => window.db.collection('products').onSnapshot(snap => setProducts(snap.docs.map(d => ({
    _id: d.id,
    ...d.data()
  })))), []);
  const [blockId, setBlockId] = useState(PLOT_BLOCKS[0].id);
  const [page, setPage] = useState(0);
  const [plotsByLot, setPlotsByLot] = useState({});
  const [loadingPlots, setLoadingPlots] = useState(true);
  const [assignSlot, setAssignSlot] = useState(null);
  const [detailSlot, setDetailSlot] = useState(null);
  useEffect(() => {
    setLoadingPlots(true);
    return window.db.collection('plots').where('blockId', '==', blockId).onSnapshot(snap => {
      const map = {};
      snap.docs.forEach(d => {
        map[d.data().lotNo] = {
          _id: d.id,
          ...d.data()
        };
      });
      setPlotsByLot(map);
      setLoadingPlots(false);
    });
  }, [blockId]);
  const block = PLOT_BLOCKS.find(b => b.id === blockId);
  const product = products.find(p => p._id === block.productId);
  const typeLabel = product ? product.name : block.productId;
  const unitWord = block.unitLabel || 'Lot';
  const totalPages = Math.ceil(block.size / PLOT_PAGE_SIZE);
  const start = page * PLOT_PAGE_SIZE + 1;
  const end = Math.min((page + 1) * PLOT_PAGE_SIZE, block.size);
  let availableCount = 0,
    reservedCount = 0,
    occupiedCount = 0;
  for (let n = 1; n <= block.size; n++) {
    const st = plotStatus(plotsByLot[n]);
    if (st === 'available') availableCount++;else if (st === 'reserved') reservedCount++;else occupiedCount++;
  }
  const slots = [];
  for (let n = start; n <= end; n++) slots.push(n);
  const detailDoc = detailSlot ? plotsByLot[detailSlot] : null;
  return plotEl(React.Fragment, null,
  // block tabs
  plotEl("div", {
    style: {
      display: 'flex',
      gap: 6,
      flexWrap: 'wrap',
      marginBottom: 16
    }
  }, PLOT_BLOCKS.map(b => plotEl("button", {
    key: b.id,
    className: `btn btn-sm ${b.id === blockId ? 'btn-primary' : 'btn-outline'}`,
    onClick: () => {
      setBlockId(b.id);
      setPage(0);
      setDetailSlot(null);
    }
  }, b.label))),
  // summary
  plotEl("div", {
    className: "stats-row",
    style: {
      gridTemplateColumns: 'repeat(4,minmax(0,1fr))',
      marginBottom: 16
    }
  }, plotEl("div", {
    className: "stat-card"
  }, plotEl("div", {
    className: "stat-badge",
    style: {
      background: 'var(--badge-2)',
      color: 'var(--badge-2-ic)'
    }
  }, "🗺"), plotEl("div", null, plotEl("div", {
    className: "stat-num"
  }, block.size), plotEl("div", {
    className: "stat-lbl"
  }, block.label, " · ", typeLabel))), plotEl("div", {
    className: "stat-card"
  }, plotEl("div", {
    className: "stat-badge",
    style: {
      background: '#e8f5e9',
      color: '#2e7d32'
    }
  }, "🟢"), plotEl("div", null, plotEl("div", {
    className: "stat-num"
  }, availableCount), plotEl("div", {
    className: "stat-lbl"
  }, "Available"))), plotEl("div", {
    className: "stat-card"
  }, plotEl("div", {
    className: "stat-badge",
    style: {
      background: '#fff3e0',
      color: '#e65100'
    }
  }, "🟡"), plotEl("div", null, plotEl("div", {
    className: "stat-num"
  }, reservedCount), plotEl("div", {
    className: "stat-lbl"
  }, "Reserved"))), plotEl("div", {
    className: "stat-card"
  }, plotEl("div", {
    className: "stat-badge",
    style: {
      background: '#e3f2fd',
      color: '#1565c0'
    }
  }, "🔴"), plotEl("div", null, plotEl("div", {
    className: "stat-num"
  }, occupiedCount), plotEl("div", {
    className: "stat-lbl"
  }, "Occupied")))),
  // pager
  plotEl("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10
    }
  }, plotEl("div", {
    style: {
      display: 'flex',
      gap: 14,
      fontSize: 12.5,
      color: 'var(--ink-3)'
    }
  }, plotEl("span", null, "🟢 Available"), plotEl("span", null, "🟡 Reserved"), plotEl("span", null, "🔴 Occupied")), totalPages > 1 && plotEl("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 12.5,
      color: 'var(--ink-3)'
    }
  }, plotEl("button", {
    className: "btn btn-outline btn-sm",
    disabled: page === 0,
    onClick: () => setPage(p => p - 1)
  }, "‹"), plotEl("span", null, plotCode(block, start), "–", plotCode(block, end), " · Page ", page + 1, " of ", totalPages), plotEl("button", {
    className: "btn btn-outline btn-sm",
    disabled: page >= totalPages - 1,
    onClick: () => setPage(p => p + 1)
  }, "›"))),
  // grid
  loadingPlots ? plotEl("div", {
    className: "loading"
  }, plotEl("div", {
    className: "spinner"
  }), plotEl("div", null, "Loading ", block.label, "…")) : plotEl("div", {
    style: {
      background: 'var(--card)',
      borderRadius: 'var(--radius)',
      boxShadow: 'var(--shadow)',
      padding: 16
    }
  }, plotEl("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(66px, 1fr))',
      gap: 6
    }
  }, slots.map(n => {
    const st = plotStatus(plotsByLot[n]);
    const colors = st === 'available' ? {
      bg: '#e8f5e9',
      fg: '#2e7d32'
    } : st === 'reserved' ? {
      bg: '#fff3e0',
      fg: '#e65100'
    } : {
      bg: '#e3f2fd',
      fg: '#1565c0'
    };
    return plotEl("div", {
      key: n,
      onClick: () => st === 'available' ? setAssignSlot(n) : setDetailSlot(n),
      style: {
        background: colors.bg,
        color: colors.fg,
        borderRadius: 7,
        padding: '7px 3px',
        fontSize: 11.5,
        fontWeight: 700,
        textAlign: 'center',
        cursor: 'pointer'
      }
    }, plotCode(block, n));
  }))),
  // modals
  assignSlot && plotEl(AssignPlotModal, {
    block: block,
    lotNo: assignSlot,
    typeLabel: typeLabel,
    customers: customers,
    currentUser: currentUser,
    onClose: () => setAssignSlot(null),
    onSaved: () => {
      setAssignSlot(null);
      onToast(`${plotCode(block, assignSlot)} assigned`);
    }
  }), detailSlot && detailDoc && plotEl(PlotDetailModal, {
    block: block,
    lotNo: detailSlot,
    typeLabel: typeLabel,
    plot: detailDoc,
    customers: customers,
    onClose: () => setDetailSlot(null),
    onOpenCustomer: id => {
      setDetailSlot(null);
      onOpenCustomer(id);
    },
    onUnassign: async () => {
      if (!confirm(`Remove this assignment? ${plotCode(block, detailSlot)} will become available again.`)) return;
      await window.db.collection('plots').doc(detailDoc._id).delete();
      setDetailSlot(null);
      onToast(`${plotCode(block, detailSlot)} unassigned`);
    }
  }));
}
function AssignPlotModal({
  block,
  lotNo,
  typeLabel,
  customers,
  currentUser,
  onClose,
  onSaved
}) {
  const [customerId, setCustomerId] = useState('');
  const [status, setStatus] = useState('reserved');
  const [hold, setHold] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const save = async e => {
    e.preventDefault();
    if (!customerId) {
      setErr('Pick a customer first.');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const id = `${block.id}_${lotNo}`;
      await window.db.collection('plots').doc(id).set({
        blockId: block.id,
        lotNo,
        customerId,
        status,
        hold,
        note: note.trim(),
        createdAt: Date.now(),
        createdBy: currentUser && currentUser.email || 'unknown'
      });
      onSaved();
    } catch (err2) {
      setErr(err2 && err2.message || 'Could not save this assignment.');
    } finally {
      setBusy(false);
    }
  };
  return plotEl("div", {
    className: "modal-bg",
    onClick: e => e.target === e.currentTarget && onClose()
  }, plotEl("div", {
    className: "modal"
  }, plotEl("h3", null, plotCode(block, lotNo), " · ", block.label, " · ", typeLabel), plotEl("form", {
    onSubmit: save
  }, plotEl("div", {
    className: "field"
  }, plotEl("label", null, "Customer"), plotEl("select", {
    value: customerId,
    onChange: e => setCustomerId(e.target.value)
  }, plotEl("option", {
    value: ""
  }, "Select a customer…"), customers.map(c => plotEl("option", {
    key: c._id,
    value: c._id
  }, c.fullName || `${c.firstName} ${c.lastName}`)))), plotEl("div", {
    className: "field"
  }, plotEl("label", null, "Status"), plotEl("select", {
    value: status,
    onChange: e => setStatus(e.target.value)
  }, plotEl("option", {
    value: "reserved"
  }, "Reserved"), plotEl("option", {
    value: "occupied"
  }, "Occupied / Sold"))), plotEl("div", {
    className: "field",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, plotEl("input", {
    type: "checkbox",
    id: "plot-hold",
    checked: hold,
    onChange: e => setHold(e.target.checked),
    style: {
      width: 'auto'
    }
  }), plotEl("label", {
    htmlFor: "plot-hold",
    style: {
      margin: 0
    }
  }, "On hold")), plotEl("div", {
    className: "field"
  }, plotEl("label", null, "Note (optional)"), plotEl("input", {
    value: note,
    onChange: e => setNote(e.target.value),
    placeholder: "e.g. reserved during site visit"
  })), err && plotEl("div", {
    className: "err-msg"
  }, err), plotEl("div", {
    className: "modal-actions"
  }, plotEl("button", {
    type: "button",
    className: "btn btn-outline",
    onClick: onClose
  }, "Cancel"), plotEl("button", {
    type: "submit",
    className: "btn btn-primary",
    disabled: busy
  }, busy ? 'Saving…' : 'Assign')))));
}
function PlotDetailModal({
  block,
  lotNo,
  typeLabel,
  plot,
  customers,
  onClose,
  onOpenCustomer,
  onUnassign
}) {
  const status = plotStatus(plot);
  const customer = customers.find(c => c._id === plot.customerId);
  const bal = customer ? planBalance(customer) : null;
  return plotEl("div", {
    className: "modal-bg",
    onClick: e => e.target === e.currentTarget && onClose()
  }, plotEl("div", {
    className: "modal"
  }, plotEl("h3", null, plotCode(block, lotNo), " · ", block.label, " · ", typeLabel), plotEl("span", {
    className: status === 'occupied' ? 'badge badge-converted' : 'badge badge-contacted'
  }, status === 'occupied' ? 'Occupied' : 'Reserved'), plot.hold && plotEl("span", {
    className: "badge badge-closed",
    style: {
      marginLeft: 6
    }
  }, "On hold"), plotEl("div", {
    className: "field",
    style: {
      marginTop: 16
    }
  }, plotEl("label", null, "Customer"), customer ? plotEl("div", {
    style: {
      fontWeight: 700
    }
  }, customer.fullName || `${customer.firstName} ${customer.lastName}`) : plotEl("div", {
    style: {
      color: 'var(--ink-3)'
    }
  }, "Linked customer record not found (may have been deleted).")), customer && bal && plotEl("div", {
    className: "plan-summary"
  }, plotEl("div", null, plotEl("div", {
    className: "lbl"
  }, "Plan"), plotEl("div", {
    className: "val"
  }, customer.plan ? customer.plan.tierName : '—')), plotEl("div", null, plotEl("div", {
    className: "lbl"
  }, "Paid"), plotEl("div", {
    className: "val"
  }, fmt(bal.paid))), plotEl("div", null, plotEl("div", {
    className: "lbl"
  }, "Balance"), plotEl("div", {
    className: "val"
  }, fmt(bal.balance)))), plot.note && plotEl("div", {
    className: "field"
  }, plotEl("label", null, "Note"), plotEl("div", null, plot.note)), plotEl("div", {
    className: "modal-actions"
  }, plotEl("button", {
    className: "btn btn-danger btn-sm",
    onClick: onUnassign
  }, "Unassign"), plotEl("button", {
    className: "btn btn-outline",
    onClick: onClose
  }, "Close"), customer && plotEl("button", {
    className: "btn btn-primary",
    onClick: () => onOpenCustomer(customer._id)
  }, "View Full Customer Record"))));
}
function Customers({
  currentUser
}) {
  const [rows, setRows] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [toast, setToast] = useState('');
  const [view, setView] = useState('list');
  const [search, setSearch] = useState('');
  useEffect(() => {
    return window.db.collection('customers').orderBy('createdAt', 'desc').onSnapshot(snap => setRows(snap.docs.map(d => ({
      _id: d.id,
      ...d.data()
    }))));
  }, []);
  const updateStatus = async (id, status) => {
    await changeStage(id, status, currentUser && currentUser.email);
    setToast('Customer updated');
  };
  const deleteCustomer = async (id, name) => {
    if (!confirm(`Delete ${name}? They'll be moved to Recently Deleted.`)) return;
    const doc = rows.find(r => r._id === id);
    const {
      _id,
      ...data
    } = doc || {};
    await moveToTrash('customers', id, data, currentUser && currentUser.email);
    setToast('Customer moved to Recently Deleted');
  };
  if (!rows) return /*#__PURE__*/React.createElement("div", {
    className: "loading"
  }, /*#__PURE__*/React.createElement("div", {
    className: "spinner"
  }), /*#__PURE__*/React.createElement("div", null, "Loading customers…"));
  const openCustomer = rows.find(r => r._id === openId) || null;
  const q = search.trim().toLowerCase();
  const filteredRows = q ? rows.filter(r => (r.fullName || `${r.firstName || ''} ${r.lastName || ''}`).toLowerCase().includes(q)) : rows;
  return /*#__PURE__*/React.createElement(React.Fragment, null, toast && /*#__PURE__*/React.createElement(Toast, {
    msg: toast,
    onDone: () => setToast('')
  }), showAdd && /*#__PURE__*/React.createElement(AddCustomerModal, {
    onClose: () => setShowAdd(false),
    onSaved: () => {
      setShowAdd(false);
      setToast('Customer added');
    }
  }), openCustomer && /*#__PURE__*/React.createElement(CustomerDetailModal, {
    customer: openCustomer,
    currentUser: currentUser,
    onClose: () => setOpenId(null),
    onToast: setToast
  }), /*#__PURE__*/React.createElement("div", {
    className: "section-hd"
  }, /*#__PURE__*/React.createElement("h2", null, "Customers / Leads ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--ink-3)',
      fontWeight: 400,
      fontSize: 13
    }
  }, "(", q ? `${filteredRows.length} of ${rows.length}` : rows.length, ")")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: `btn btn-sm ${view === 'plots' ? 'btn-gold' : 'btn-outline'}`,
    onClick: () => setView(view === 'plots' ? 'list' : 'plots')
  }, view === 'plots' ? '👥 Customer list' : '🗺️ Plot management'), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-outline btn-sm",
    onClick: () => window.print()
  }, "🖨 Print all"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary btn-sm",
    onClick: () => setShowAdd(true)
  }, "+ Add customer"))), view === 'list' && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      maxWidth: 320,
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("input", {
    value: search,
    onChange: e => setSearch(e.target.value),
    placeholder: "🔍 Search by client name…",
    style: {
      width: '100%',
      padding: '9px 32px 9px 12px',
      border: '1.5px solid var(--border)',
      borderRadius: 8,
      outline: 'none',
      fontSize: 13
    }
  }), search && /*#__PURE__*/React.createElement("button", {
    onClick: () => setSearch(''),
    "aria-label": "Clear search",
    style: {
      position: 'absolute',
      right: 8,
      top: '50%',
      transform: 'translateY(-50%)',
      background: 'none',
      border: 'none',
      color: 'var(--ink-3)',
      fontSize: 15,
      lineHeight: 1,
      padding: 4
    }
  }, "✕")), view === 'plots' && /*#__PURE__*/React.createElement(PlotManagement, {
    currentUser: currentUser,
    customers: rows,
    onOpenCustomer: id => setOpenId(id),
    onToast: setToast
  }), view === 'list' && /*#__PURE__*/React.createElement("div", {
    className: "table-card"
  }, filteredRows.length === 0 ? /*#__PURE__*/React.createElement("div", {
    className: "empty"
  }, q ? `No customers match "${search.trim()}".` : "No customers yet. Leads from your website form appear here automatically.") : /*#__PURE__*/React.createElement("table", {
    className: "gh-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Name"), /*#__PURE__*/React.createElement("th", null, "Contact"), /*#__PURE__*/React.createElement("th", null, "Plan"), /*#__PURE__*/React.createElement("th", null, "Balance"), /*#__PURE__*/React.createElement("th", null, "Revenue"), /*#__PURE__*/React.createElement("th", null, "Status"), /*#__PURE__*/React.createElement("th", null))), /*#__PURE__*/React.createElement("tbody", null, filteredRows.map(r => {
    const bal = planBalance(r);
    return /*#__PURE__*/React.createElement("tr", {
      key: r._id
    }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        cursor: 'pointer'
      },
      onClick: () => setOpenId(r._id)
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 30,
        height: 30,
        borderRadius: '50%',
        background: 'var(--green)',
        color: '#fff',
        display: 'grid',
        placeItems: 'center',
        fontSize: 11,
        fontWeight: 700,
        flexShrink: 0
      }
    }, initials(r.fullName || `${r.firstName || ''} ${r.lastName || ''}`)), /*#__PURE__*/React.createElement("strong", null, r.fullName || `${r.firstName} ${r.lastName}`))), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("a", {
      href: `mailto:${r.email}`,
      style: {
        color: 'var(--green)'
      }
    }, r.email)), /*#__PURE__*/React.createElement("div", {
      style: {
        color: 'var(--ink-3)',
        fontSize: 12
      }
    }, r.phone)), /*#__PURE__*/React.createElement("td", null, r.plan ? /*#__PURE__*/React.createElement("span", {
      className: "plan-badge"
    }, r.plan.tierName) : r.interestedPlanName ? /*#__PURE__*/React.createElement("span", {
      className: "plan-badge none",
      title: "Expressed interest on the website — not a formal plan yet"
    }, "Interested: ", r.interestedPlanName) : /*#__PURE__*/React.createElement("span", {
      className: "plan-badge none"
    }, "No plan yet")), /*#__PURE__*/React.createElement("td", null, bal ? /*#__PURE__*/React.createElement("div", {
      style: {
        minWidth: 110
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontWeight: 700,
        fontSize: 13
      }
    }, fmt(bal.balance)), /*#__PURE__*/React.createElement("div", {
      className: "progress-track",
      style: {
        marginTop: 4
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "progress-fill",
      style: {
        width: `${bal.pct}%`
      }
    }))) : /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--ink-3)'
      }
    }, "—")), /*#__PURE__*/React.createElement("td", null, totalPaid(r) > 0 ? /*#__PURE__*/React.createElement("div", {
      style: {
        fontWeight: 700,
        fontSize: 13,
        color: 'var(--green)'
      }
    }, fmt(totalPaid(r))) : /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--ink-3)'
      }
    }, "—")), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("select", {
      className: "status-sel",
      value: normalizeStage(r.status),
      onChange: e => updateStatus(r._id, e.target.value)
    }, STAGES.map(s => /*#__PURE__*/React.createElement("option", {
      key: s.id,
      value: s.id
    }, s.label)))), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 6
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn btn-outline btn-sm",
      onClick: () => setOpenId(r._id)
    }, "View"), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-danger btn-sm",
      onClick: () => deleteCustomer(r._id, r.fullName)
    }, "Delete"))));
  })))), /*#__PURE__*/React.createElement("div", {
    className: "print-sheet"
  }, /*#__PURE__*/React.createElement("div", {
    className: "letterhead"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "brand"
  }, "Golden Harmonic Memorial Park"), /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, "Customer / Leads Summary — Internal Records")), /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, "Printed: ", new Date().toLocaleString('en-PH'))), /*#__PURE__*/React.createElement("table", null, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Name"), /*#__PURE__*/React.createElement("th", null, "Email"), /*#__PURE__*/React.createElement("th", null, "Phone"), /*#__PURE__*/React.createElement("th", null, "Plan"), /*#__PURE__*/React.createElement("th", null, "Balance"), /*#__PURE__*/React.createElement("th", null, "Status"), /*#__PURE__*/React.createElement("th", null, "Follow-up"))), /*#__PURE__*/React.createElement("tbody", null, rows.map(r => {
    const bal = planBalance(r);
    return /*#__PURE__*/React.createElement("tr", {
      key: r._id
    }, /*#__PURE__*/React.createElement("td", null, r.fullName || `${r.firstName} ${r.lastName}`), /*#__PURE__*/React.createElement("td", null, r.email || '—'), /*#__PURE__*/React.createElement("td", null, r.phone || '—'), /*#__PURE__*/React.createElement("td", null, r.plan ? r.plan.tierName : r.interestedPlanName || '—'), /*#__PURE__*/React.createElement("td", null, bal ? fmt(bal.balance) : '—'), /*#__PURE__*/React.createElement("td", null, STAGE_LABEL[normalizeStage(r.status)]), /*#__PURE__*/React.createElement("td", null, r.followUpAt || '—'));
  }))), /*#__PURE__*/React.createElement("div", {
    className: "footer-note"
  }, "Total customers/leads on record: ", rows.length)));
}

// Shared plan-terms fields, used by both the Add Customer and Edit Plan forms.
function PlanFields({
  plan,
  onChange
}) {
  const p = plan || {
    tierId: '',
    tierName: '',
    price: 0,
    termKey: '1yr',
    startDate: new Date().toISOString().slice(0, 10)
  };
  const set = patch => onChange({
    ...p,
    ...patch
  });

  // Live plot photos, keyed by product id, so whatever image staff set in
  // Products & Pricing is what gets attached when a plan is chosen here.
  const [productImages, setProductImages] = useState({});
  useEffect(() => {
    return window.db.collection('products').onSnapshot(snap => {
      const map = {};
      snap.docs.forEach(d => {
        if (d.data().imageUrl) map[d.id] = d.data().imageUrl;
      });
      setProductImages(map);
    });
  }, []);
  const pickTier = tierId => {
    const tier = BASE_TIERS.find(t => t.id === tierId);
    if (!tier) {
      onChange(null);
      return;
    }
    set({
      tierId,
      tierName: tier.name,
      price: tier.price,
      termKey: p.termKey || '1yr',
      imageUrl: productImages[tierId] || tier.imageUrl || ''
    });
  };
  const term = PLAN_TERMS.find(t => t.key === (p.termKey || '1yr')) || PLAN_TERMS[1];
  const total = (Number(p.price) || 0) * (1 + term.surcharge);
  const monthly = term.months ? Math.round(total / term.months) : 0;
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", null, "Plot / plan"), /*#__PURE__*/React.createElement("select", {
    value: p.tierId,
    onChange: e => e.target.value ? pickTier(e.target.value) : onChange(null)
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "No plan yet — just a lead"), BASE_TIERS.map(t => /*#__PURE__*/React.createElement("option", {
    key: t.id,
    value: t.id
  }, t.name, " — ", fmt(t.price))))), p.tierId && /*#__PURE__*/React.createElement(React.Fragment, null, p.imageUrl && /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: p.imageUrl,
    alt: p.tierName,
    style: {
      width: '100%',
      maxHeight: 160,
      objectFit: 'cover',
      borderRadius: 8
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", null, "Spot cash price (₱)"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    value: p.price,
    onChange: e => set({
      price: e.target.value
    })
  })), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", null, "Start date"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: p.startDate,
    onChange: e => set({
      startDate: e.target.value
    })
  }))), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", null, "Payment term — no down payment on any plan"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      flexWrap: 'wrap'
    }
  }, PLAN_TERMS.map(t => /*#__PURE__*/React.createElement("button", {
    key: t.key,
    type: "button",
    className: `btn btn-sm ${p.termKey === t.key || !p.termKey && t.key === '1yr' ? 'btn-primary' : 'btn-outline'}`,
    onClick: () => set({
      termKey: t.key
    })
  }, t.label))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--ink-3)',
      marginTop: 6
    }
  }, term.key === 'cash' ? `Due in full: ${fmt(p.price)}` : `${fmt(monthly)}/mo for ${term.months} months (total ${fmt(total)}, includes ${Math.round(term.surcharge * 100)}% surcharge)`))));
}
function buildPlanPayload(p) {
  if (!p || !p.tierId) return null;
  const term = PLAN_TERMS.find(t => t.key === (p.termKey || '1yr')) || PLAN_TERMS[1];
  const price = Number(p.price) || 0;
  const total = price * (1 + term.surcharge);
  const monthlyAmount = term.months ? Math.round(total / term.months) : 0;
  return {
    tierId: p.tierId,
    tierName: p.tierName,
    price,
    termKey: term.key,
    termLabel: term.label,
    surchargePct: term.surcharge,
    termMonths: term.months,
    totalPrice: Math.round(total),
    monthlyAmount,
    startDate: p.startDate,
    imageUrl: p.imageUrl || ''
  };
}
function AddCustomerModal({
  onClose,
  onSaved
}) {
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    preferredLocation: 'Either park',
    interest: 'Pre-need (planning ahead)',
    status: 'new'
  });
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = k => e => setForm(f => ({
    ...f,
    [k]: e.target.value
  }));
  const save = async e => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const planPayload = buildPlanPayload(plan);
      await window.db.collection('customers').add({
        ...form,
        fullName: `${form.firstName} ${form.lastName}`,
        source: 'admin',
        plan: planPayload,
        payments: [],
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      onSaved();
    } catch (ex) {
      setErr('Could not save. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "modal-bg",
    onClick: e => e.target === e.currentTarget && onClose()
  }, /*#__PURE__*/React.createElement("div", {
    className: "modal wide"
  }, /*#__PURE__*/React.createElement("h3", null, "Add Customer"), /*#__PURE__*/React.createElement("form", {
    onSubmit: save
  }, /*#__PURE__*/React.createElement("div", {
    className: "modal-scroll"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", null, "First name"), /*#__PURE__*/React.createElement("input", {
    required: true,
    value: form.firstName,
    onChange: set('firstName'),
    placeholder: "Maria"
  })), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", null, "Last name"), /*#__PURE__*/React.createElement("input", {
    required: true,
    value: form.lastName,
    onChange: set('lastName'),
    placeholder: "Santos"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", null, "Email"), /*#__PURE__*/React.createElement("input", {
    type: "email",
    required: true,
    value: form.email,
    onChange: set('email'),
    placeholder: "maria@example.com"
  })), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", null, "Phone"), /*#__PURE__*/React.createElement("input", {
    value: form.phone,
    onChange: set('phone'),
    placeholder: "+63 917 ..."
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", null, "Location"), /*#__PURE__*/React.createElement("select", {
    value: form.preferredLocation,
    onChange: set('preferredLocation')
  }, /*#__PURE__*/React.createElement("option", null, "Either park"), /*#__PURE__*/React.createElement("option", null, "Aborlan"), /*#__PURE__*/React.createElement("option", null, "Roxas"))), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", null, "Status"), /*#__PURE__*/React.createElement("select", {
    value: form.status,
    onChange: set('status')
  }, /*#__PURE__*/React.createElement("option", {
    value: "lead"
  }, "Lead"), /*#__PURE__*/React.createElement("option", {
    value: "active"
  }, "Active"), /*#__PURE__*/React.createElement("option", {
    value: "converted"
  }, "Converted")))), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", null, "Interest"), /*#__PURE__*/React.createElement("select", {
    value: form.interest,
    onChange: set('interest')
  }, /*#__PURE__*/React.createElement("option", null, "Pre-need (planning ahead)"), /*#__PURE__*/React.createElement("option", null, "At-need (immediate)"), /*#__PURE__*/React.createElement("option", null, "Investment / resale"), /*#__PURE__*/React.createElement("option", null, "Just exploring"))), /*#__PURE__*/React.createElement("hr", {
    style: {
      border: 'none',
      borderTop: '1px solid var(--border)',
      margin: '18px 0'
    }
  }), /*#__PURE__*/React.createElement(PlanFields, {
    plan: plan,
    onChange: setPlan
  })), err && /*#__PURE__*/React.createElement("p", {
    className: "err-msg"
  }, err), /*#__PURE__*/React.createElement("div", {
    className: "modal-actions"
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "btn btn-outline",
    onClick: onClose
  }, "Cancel"), /*#__PURE__*/React.createElement("button", {
    type: "submit",
    className: "btn btn-primary",
    disabled: busy
  }, busy ? 'Saving…' : 'Save customer')))));
}

// ── Charts (Chart.js) ────────────────────────────────────────────────────
function useChart(canvasRef, config) {
  useEffect(() => {
    if (!canvasRef.current || !window.Chart) return;
    const chart = new window.Chart(canvasRef.current, config);
    return () => chart.destroy();
  }, [JSON.stringify(config)]);
}
function InquiriesBarChart({
  inquiries
}) {
  const ref = useRef(null);

  // Build the last 6 months as labels, counting inquiries created in each.
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: d.toLocaleString('en-PH', {
        month: 'short'
      })
    });
  }
  const counts = months.map(m => 0);
  for (const inq of inquiries) {
    const t = inq.createdAt && inq.createdAt.toDate ? inq.createdAt.toDate() : inq.createdAt ? new Date(inq.createdAt) : null;
    if (!t) continue;
    const key = `${t.getFullYear()}-${t.getMonth()}`;
    const idx = months.findIndex(m => m.key === key);
    if (idx >= 0) counts[idx]++;
  }
  useChart(ref, {
    type: 'bar',
    data: {
      labels: months.map(m => m.label),
      datasets: [{
        data: counts,
        backgroundColor: '#5b57d1',
        borderRadius: 6,
        maxBarThickness: 36
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0
          },
          grid: {
            color: '#eef0f6'
          }
        },
        x: {
          grid: {
            display: false
          }
        }
      }
    }
  });
  return /*#__PURE__*/React.createElement("canvas", {
    ref: ref
  });
}
function PipelineDonutChart({
  customers
}) {
  const ref = useRef(null);
  const colors = ['#5b57d1', '#2980b9', '#b08544', '#2f5d4c', '#27ae60', '#c0392b'];
  const counts = STAGES.map(s => customers.filter(c => normalizeStage(c.status) === s.id).length);
  useChart(ref, {
    type: 'doughnut',
    data: {
      labels: STAGES.map(s => s.label),
      datasets: [{
        data: counts,
        backgroundColor: colors,
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: {
          display: false
        }
      }
    }
  });
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("canvas", {
    ref: ref
  }), /*#__PURE__*/React.createElement("div", {
    className: "donut-legend"
  }, STAGES.map((s, i) => /*#__PURE__*/React.createElement("div", {
    key: s.id,
    className: "donut-legend-item"
  }, /*#__PURE__*/React.createElement("span", {
    className: "donut-dot",
    style: {
      background: colors[i]
    }
  }), s.label, " — ", counts[i]))));
}

// ── Pipeline: drag-and-drop CRM board over the same customers collection ───
function Pipeline({
  currentUser
}) {
  const [rows, setRows] = useState(null);
  const [inquiries, setInquiries] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [toast, setToast] = useState('');
  const [dragOverStage, setDragOverStage] = useState(null);
  useEffect(() => {
    return window.db.collection('customers').orderBy('createdAt', 'desc').onSnapshot(snap => setRows(snap.docs.map(d => ({
      _id: d.id,
      ...d.data()
    }))));
  }, []);
  useEffect(() => {
    return window.db.collection('inquiries').orderBy('createdAt', 'desc').onSnapshot(snap => setInquiries(snap.docs.map(d => ({
      _id: d.id,
      ...d.data()
    }))));
  }, []);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(''), 2200);
      return () => clearTimeout(t);
    }
  }, [toast]);
  if (!rows) return /*#__PURE__*/React.createElement("div", {
    className: "loading"
  }, /*#__PURE__*/React.createElement("div", {
    className: "spinner"
  }), /*#__PURE__*/React.createElement("div", null, "Loading pipeline…"));
  const byStage = Object.fromEntries(STAGES.map(s => [s.id, []]));
  for (const r of rows) byStage[normalizeStage(r.status)].push(r);
  const dueList = rows.filter(r => r.followUpAt && (isOverdue(r.followUpAt) || isDueToday(r.followUpAt)));
  const openCustomer = rows.find(r => r._id === openId);
  const drop = async (stageId, e) => {
    e.preventDefault();
    setDragOverStage(null);
    const id = e.dataTransfer.getData('text/plain');
    if (!id) return;
    await changeStage(id, stageId, currentUser && currentUser.email);
    setToast('Moved to ' + STAGE_LABEL[stageId]);
  };
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "section-hd"
  }, /*#__PURE__*/React.createElement("h2", null, "Pipeline ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--ink-3)',
      fontWeight: 400,
      fontSize: 13
    }
  }, "(", rows.length, ")"))), /*#__PURE__*/React.createElement("div", {
    className: "charts-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "chart-card"
  }, /*#__PURE__*/React.createElement("h3", null, "Inquiries — last 6 months"), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 220
    }
  }, /*#__PURE__*/React.createElement(InquiriesBarChart, {
    inquiries: inquiries
  }))), /*#__PURE__*/React.createElement("div", {
    className: "chart-card"
  }, /*#__PURE__*/React.createElement("h3", null, "Pipeline breakdown"), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 150
    }
  }, /*#__PURE__*/React.createElement(PipelineDonutChart, {
    customers: rows
  })))), dueList.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff8e1',
      border: '1px solid #ffe082',
      borderRadius: 8,
      padding: '10px 14px',
      marginBottom: 16,
      fontSize: 13
    }
  }, /*#__PURE__*/React.createElement("strong", null, "⏰ ", dueList.length, " follow-up", dueList.length > 1 ? 's' : '', " due:"), ' ', dueList.map((r, i) => /*#__PURE__*/React.createElement("span", {
    key: r._id
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => {
      e.preventDefault();
      setOpenId(r._id);
    },
    style: {
      color: isOverdue(r.followUpAt) ? '#c0392b' : '#8a6d3b',
      fontWeight: 600
    }
  }, r.fullName || r.firstName), i < dueList.length - 1 ? ', ' : ''))), /*#__PURE__*/React.createElement("div", {
    className: "kanban-board"
  }, STAGES.map(stage => /*#__PURE__*/React.createElement("div", {
    key: stage.id,
    className: "kanban-col",
    onDragOver: e => {
      e.preventDefault();
      setDragOverStage(stage.id);
    },
    onDragLeave: () => setDragOverStage(null),
    onDrop: e => drop(stage.id, e),
    style: {
      background: dragOverStage === stage.id ? '#eef6f0' : 'var(--bg-2,#f4f1e8)',
      borderRadius: 10,
      padding: 10,
      minHeight: 400,
      border: dragOverStage === stage.id ? '2px dashed var(--green,#3f7a5c)' : '2px dashed transparent'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
      padding: '0 4px'
    }
  }, /*#__PURE__*/React.createElement("strong", {
    style: {
      fontSize: 13
    }
  }, stage.label), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: 'var(--ink-3)',
      background: '#fff',
      borderRadius: 10,
      padding: '1px 8px'
    }
  }, byStage[stage.id].length)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }
  }, byStage[stage.id].map(c => /*#__PURE__*/React.createElement("div", {
    key: c._id,
    draggable: true,
    onDragStart: e => e.dataTransfer.setData('text/plain', c._id),
    onClick: () => setOpenId(c._id),
    style: {
      background: '#fff',
      borderRadius: 8,
      padding: '10px 12px',
      cursor: 'grab',
      boxShadow: '0 1px 2px rgba(0,0,0,.06)',
      fontSize: 13
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "kanban-card-name",
    style: {
      fontWeight: 700,
      marginBottom: 2
    }
  }, c.fullName || `${c.firstName} ${c.lastName}`), /*#__PURE__*/React.createElement("div", {
    className: "kanban-card-name",
    style: {
      color: 'var(--ink-3)',
      fontSize: 11.5
    }
  }, c.interest || '—'), c.followUpAt && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 6,
      fontSize: 11,
      fontWeight: 600,
      color: isOverdue(c.followUpAt) ? '#c0392b' : isDueToday(c.followUpAt) ? '#b7791f' : 'var(--ink-3)'
    }
  }, isOverdue(c.followUpAt) ? '🔴' : isDueToday(c.followUpAt) ? '🟡' : '📅', " ", c.followUpAt), totalPaid(c) > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 4,
      fontSize: 11.5,
      color: 'var(--green,#3f7a5c)',
      fontWeight: 700
    }
  }, fmt(totalPaid(c))))), byStage[stage.id].length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: 'var(--ink-3)',
      textAlign: 'center',
      padding: '16px 4px'
    }
  }, "Drop a card here"))))), openCustomer && /*#__PURE__*/React.createElement(CustomerDetailModal, {
    customer: openCustomer,
    currentUser: currentUser,
    onClose: () => setOpenId(null),
    onToast: setToast
  }), toast && /*#__PURE__*/React.createElement("div", {
    className: "toast"
  }, toast));
}

// ── Customer detail: plan summary + payment history + log a payment ────────
// Creates a Firebase Auth login for a customer WITHOUT signing the admin
// out. Normal createUserWithEmailAndPassword() on the default app signs
// you in as the new user, which would kick the admin out of their own
// session — so this spins up a second, throwaway Firebase app instance
// just for the create call, then tears it down.
//
// The customer never sees a staff-generated password: right after the
// account is created we trigger Firebase's built-in "set your password"
// email, so they choose their own password themselves.
async function createPortalAccount(email) {
  const secondaryApp = firebase.initializeApp(window.firebaseConfig, 'PortalCreate_' + Date.now());
  try {
    const tempPassword = Math.random().toString(36).slice(-10) + 'Aa1!'; // never shown to anyone; overwritten by the reset-email flow below
    const cred = await secondaryApp.auth().createUserWithEmailAndPassword(email, tempPassword);
    const uid = cred.user.uid;
    await secondaryApp.auth().signOut();
    await window.auth.sendPasswordResetEmail(email);
    return uid;
  } finally {
    await secondaryApp.delete();
  }
}
function CustomerDetailModal({
  customer,
  currentUser,
  onClose,
  onToast
}) {
  const [tab, setTab] = useState('payments');
  const [editingPlan, setEditingPlan] = useState(false);
  const [plan, setPlan] = useState(customer.plan || (customer.interestedPlanId ? {
    tierId: customer.interestedPlanId,
    tierName: customer.interestedPlanName,
    price: customer.interestedPlanPrice,
    termKey: '1yr',
    startDate: new Date().toISOString().slice(0, 10)
  } : null));
  const [savingPlan, setSavingPlan] = useState(false);
  const [pay, setPay] = useState({
    date: new Date().toISOString().slice(0, 10),
    amount: '',
    method: 'Cash',
    note: ''
  });
  const [busy, setBusy] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [followUp, setFollowUp] = useState({
    date: customer.followUpAt || '',
    note: customer.followUpNote || ''
  });
  const [savingFollowUp, setSavingFollowUp] = useState(false);
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalError, setPortalError] = useState('');
  const [showManualLink, setShowManualLink] = useState(false);
  const [manualUid, setManualUid] = useState('');
  const handleCreatePortal = async () => {
    if (!customer.email) {
      setPortalError('This customer has no email on file — add one first.');
      return;
    }
    setPortalBusy(true);
    setPortalError('');
    try {
      const uid = await createPortalAccount(customer.email);
      await window.db.collection('customers').doc(customer._id).update({
        authUid: uid,
        portalCreatedAt: Date.now(),
        portalCreatedBy: currentUser && currentUser.email || 'unknown'
      });
      onToast(`Portal login created — a "set your password" email was sent to ${customer.email}`);
    } catch (err) {
      // If the Auth account got created on a previous attempt but the
      // Firestore write that saves authUid failed (network blip, etc.),
      // retrying lands here every time with no way to recover from the UI.
      // Surface the manual-link fallback right when that happens.
      const stuck = err && err.code === 'auth/email-already-in-use';
      setPortalError(stuck ? 'That email already has a Firebase Auth account (likely from a previous attempt that didn\'t finish saving). Use "Link existing account" below instead of creating a new one.' : err && err.message || 'Could not create the portal login.');
      if (stuck) setShowManualLink(true);
    } finally {
      setPortalBusy(false);
    }
  };
  const handleManualLink = async () => {
    const uid = manualUid.trim();
    if (!uid) {
      setPortalError('Paste the Firebase Auth UID first.');
      return;
    }
    // Firebase Auth UIDs are alphanumeric, no @ or spaces, and normally
    // ~28 characters — catches the most common mistake (pasting the email
    // instead of the UID) before it silently saves bad data.
    if (uid.includes('@') || uid.includes(' ') || uid.length < 15 || !/^[a-zA-Z0-9]+$/.test(uid)) {
      setPortalError('That doesn\'t look like a Firebase Auth UID — it should be a string of letters/numbers (~28 characters), not an email. Copy it from the "User UID" column in Authentication → Users.');
      return;
    }
    setPortalBusy(true);
    setPortalError('');
    try {
      await window.db.collection('customers').doc(customer._id).update({
        authUid: uid,
        portalCreatedAt: Date.now(),
        portalCreatedBy: currentUser && currentUser.email || 'unknown'
      });
      onToast('Account linked — customer can now log in.');
      setShowManualLink(false);
      setManualUid('');
    } catch (err) {
      setPortalError(err && err.message || 'Could not link the account.');
    } finally {
      setPortalBusy(false);
    }
  };
  const resendPortalReset = async () => {
    setPortalBusy(true);
    setPortalError('');
    try {
      await window.auth.sendPasswordResetEmail(customer.email);
      onToast(`Password-setup email re-sent to ${customer.email}`);
    } catch (err) {
      setPortalError(err && err.message || 'Could not send the email.');
    } finally {
      setPortalBusy(false);
    }
  };
  const bal = planBalance(customer);
  const payments = [...(customer.payments || [])].sort((a, b) => a.date < b.date ? 1 : -1);

  // Merge manual notes, system stage-change notes, and payments into one
  // chronological activity feed.
  const activity = [...(customer.notes || []).map(n => ({
    kind: n.type === 'system' ? 'system' : 'note',
    text: n.text,
    author: n.author,
    at: n.createdAt
  })), ...payments.map(p => ({
    kind: 'payment',
    text: `Payment logged: ${fmt(p.amount)} (${p.method})${p.note ? ' — ' + p.note : ''}`,
    author: null,
    at: new Date(p.date).getTime()
  }))].sort((a, b) => (b.at || 0) - (a.at || 0));
  const addNote = async () => {
    if (!noteText.trim()) return;
    setAddingNote(true);
    try {
      await window.db.collection('customers').doc(customer._id).update({
        notes: firebase.firestore.FieldValue.arrayUnion({
          type: 'manual',
          text: noteText.trim(),
          author: currentUser && currentUser.email || 'unknown',
          createdAt: Date.now()
        })
      });
      setNoteText('');
      onToast('Note added');
    } finally {
      setAddingNote(false);
    }
  };
  const saveFollowUp = async () => {
    setSavingFollowUp(true);
    try {
      await window.db.collection('customers').doc(customer._id).update({
        followUpAt: followUp.date || null,
        followUpNote: followUp.note || ''
      });
      onToast('Follow-up saved');
    } finally {
      setSavingFollowUp(false);
    }
  };
  const savePlan = async () => {
    setSavingPlan(true);
    try {
      await window.db.collection('customers').doc(customer._id).update({
        plan: buildPlanPayload(plan)
      });
      setEditingPlan(false);
      onToast('Plan updated');
    } finally {
      setSavingPlan(false);
    }
  };
  const logPayment = async e => {
    e.preventDefault();
    if (!pay.amount || Number(pay.amount) <= 0) return;
    setBusy(true);
    try {
      await window.db.collection('customers').doc(customer._id).update({
        payments: firebase.firestore.FieldValue.arrayUnion({
          date: pay.date,
          amount: Number(pay.amount),
          method: pay.method,
          note: pay.note
        })
      });
      setPay({
        date: new Date().toISOString().slice(0, 10),
        amount: '',
        method: 'Cash',
        note: ''
      });
      onToast('Payment logged');
    } finally {
      setBusy(false);
    }
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "modal-bg",
    onClick: e => e.target === e.currentTarget && onClose()
  }, /*#__PURE__*/React.createElement("div", {
    className: "modal wide"
  }, /*#__PURE__*/React.createElement("h3", null, customer.fullName || `${customer.firstName} ${customer.lastName}`, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 400,
      fontSize: 13,
      color: 'var(--ink-3)',
      marginLeft: 8
    }
  }, customer.email)), customer.plan ? /*#__PURE__*/React.createElement("div", {
    className: "plan-summary",
    style: customer.plan.imageUrl ? {
      gridTemplateColumns: '96px 1fr 1fr 1fr'
    } : undefined
  }, customer.plan.imageUrl && /*#__PURE__*/React.createElement("div", {
    style: {
      gridRow: '1 / 3'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: customer.plan.imageUrl,
    alt: customer.plan.tierName,
    style: {
      width: 96,
      height: 96,
      objectFit: 'cover',
      borderRadius: 8
    }
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "lbl"
  }, "Plan"), /*#__PURE__*/React.createElement("div", {
    className: "val",
    style: {
      fontSize: 14
    }
  }, customer.plan.tierName)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "lbl"
  }, "Monthly"), /*#__PURE__*/React.createElement("div", {
    className: "val",
    style: {
      fontSize: 14
    }
  }, fmt(customer.plan.monthlyAmount), "/mo")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "lbl"
  }, "Balance"), /*#__PURE__*/React.createElement("div", {
    className: "val",
    style: {
      fontSize: 14
    }
  }, fmt(bal.balance))), /*#__PURE__*/React.createElement("div", {
    style: {
      gridColumn: customer.plan.imageUrl ? '2 / -1' : '1 / -1'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "progress-track"
  }, /*#__PURE__*/React.createElement("div", {
    className: "progress-fill",
    style: {
      width: `${bal.pct}%`
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--ink-3)',
      marginTop: 4
    }
  }, fmt(bal.paid), " paid of ", fmt(bal.price), " (", Math.round(bal.pct), "%)"))) : /*#__PURE__*/React.createElement("div", {
    className: "plan-summary",
    style: {
      gridTemplateColumns: '1fr'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: 'var(--ink-3)'
    }
  }, "No plan selected yet for this customer.")), /*#__PURE__*/React.createElement("div", {
    className: "plan-summary",
    style: {
      gridTemplateColumns: '1fr auto',
      alignItems: 'center',
      marginTop: customer.plan ? 10 : 0
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "lbl"
  }, "Portal access"), customer.authUid ? /*#__PURE__*/React.createElement("div", {
    className: "val",
    style: {
      fontSize: 13,
      color: 'var(--green)'
    }
  }, "✅ Active — customer can log in with ", customer.email, " to view their balance") : /*#__PURE__*/React.createElement("div", {
    className: "val",
    style: {
      fontSize: 13,
      color: 'var(--ink-3)'
    }
  }, "No login created yet"), portalError && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--red)',
      marginTop: 4
    }
  }, portalError), !customer.authUid && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 6
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setShowManualLink(v => !v),
    style: {
      background: 'none',
      border: 'none',
      padding: 0,
      fontSize: 12,
      color: 'var(--ink-3)',
      textDecoration: 'underline',
      cursor: 'pointer'
    }
  }, showManualLink ? 'Hide manual link' : 'Already have a Firebase Auth account for this email? Link it manually'), showManualLink && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8,
      display: 'flex',
      gap: 6,
      alignItems: 'flex-start',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("input", {
    type: "text",
    value: manualUid,
    onChange: e => setManualUid(e.target.value),
    placeholder: "Paste Firebase Auth UID",
    style: {
      fontSize: 12,
      padding: '6px 8px',
      border: '1px solid var(--line)',
      borderRadius: 6,
      minWidth: 220
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--ink-3)',
      marginTop: 4,
      maxWidth: 260
    }
  }, "Find it in Firebase console → Authentication → Users tab, search by ", customer.email || 'this customer\'s email', ", copy the User UID column.")), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-outline btn-sm",
    disabled: portalBusy,
    onClick: handleManualLink
  }, portalBusy ? 'Linking…' : 'Link account')))), /*#__PURE__*/React.createElement("div", null, customer.authUid ? /*#__PURE__*/React.createElement("button", {
    className: "btn btn-outline btn-sm",
    disabled: portalBusy,
    onClick: resendPortalReset
  }, portalBusy ? 'Sending…' : 'Resend password-setup email') : /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary btn-sm",
    disabled: portalBusy,
    onClick: handleCreatePortal
  }, portalBusy ? 'Creating…' : 'Create portal login'))), /*#__PURE__*/React.createElement("div", {
    className: "detail-tabs"
  }, /*#__PURE__*/React.createElement("button", {
    className: tab === 'payments' ? 'on' : '',
    onClick: () => setTab('payments')
  }, "Payments"), /*#__PURE__*/React.createElement("button", {
    className: tab === 'plan' ? 'on' : '',
    onClick: () => {
      setTab('plan');
      setEditingPlan(true);
    }
  }, customer.plan ? 'Edit plan' : 'Set a plan'), /*#__PURE__*/React.createElement("button", {
    className: tab === 'activity' ? 'on' : '',
    onClick: () => setTab('activity')
  }, "Activity", customer.followUpAt && isOverdue(customer.followUpAt) ? ' 🔴' : '')), /*#__PURE__*/React.createElement("div", {
    className: "modal-scroll"
  }, tab === 'payments' && /*#__PURE__*/React.createElement(React.Fragment, null, customer.plan ? /*#__PURE__*/React.createElement("form", {
    onSubmit: logPayment,
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 1fr auto',
      gap: 8,
      alignItems: 'end',
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "field",
    style: {
      margin: 0
    }
  }, /*#__PURE__*/React.createElement("label", null, "Date"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: pay.date,
    onChange: e => setPay(p => ({
      ...p,
      date: e.target.value
    }))
  })), /*#__PURE__*/React.createElement("div", {
    className: "field",
    style: {
      margin: 0
    }
  }, /*#__PURE__*/React.createElement("label", null, "Amount (₱)"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    required: true,
    value: pay.amount,
    onChange: e => setPay(p => ({
      ...p,
      amount: e.target.value
    })),
    placeholder: "3188"
  })), /*#__PURE__*/React.createElement("div", {
    className: "field",
    style: {
      margin: 0
    }
  }, /*#__PURE__*/React.createElement("label", null, "Method"), /*#__PURE__*/React.createElement("select", {
    value: pay.method,
    onChange: e => setPay(p => ({
      ...p,
      method: e.target.value
    }))
  }, /*#__PURE__*/React.createElement("option", null, "Cash"), /*#__PURE__*/React.createElement("option", null, "Bank transfer"), /*#__PURE__*/React.createElement("option", null, "GCash"), /*#__PURE__*/React.createElement("option", null, "Check"))), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary btn-sm",
    disabled: busy
  }, busy ? 'Logging…' : '+ Log payment')) : /*#__PURE__*/React.createElement("div", {
    className: "empty"
  }, "Set a plan first, then payments can be logged against it."), payments.length > 0 && /*#__PURE__*/React.createElement("table", {
    className: "pay-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Date"), /*#__PURE__*/React.createElement("th", null, "Amount"), /*#__PURE__*/React.createElement("th", null, "Method"), /*#__PURE__*/React.createElement("th", null, "Note"))), /*#__PURE__*/React.createElement("tbody", null, payments.map((p, i) => /*#__PURE__*/React.createElement("tr", {
    key: i
  }, /*#__PURE__*/React.createElement("td", null, p.date), /*#__PURE__*/React.createElement("td", null, fmt(p.amount)), /*#__PURE__*/React.createElement("td", null, p.method), /*#__PURE__*/React.createElement("td", null, p.note)))))), tab === 'plan' && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(PlanFields, {
    plan: plan,
    onChange: setPlan
  }), /*#__PURE__*/React.createElement("div", {
    className: "modal-actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary btn-sm",
    disabled: savingPlan,
    onClick: savePlan
  }, savingPlan ? 'Saving…' : 'Save plan'))), tab === 'activity' && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 2fr auto',
      gap: 8,
      alignItems: 'end',
      padding: 12,
      background: 'var(--card-2, #f7f4ec)',
      borderRadius: 8,
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "field",
    style: {
      margin: 0
    }
  }, /*#__PURE__*/React.createElement("label", null, "Follow-up date"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: followUp.date,
    onChange: e => setFollowUp(f => ({
      ...f,
      date: e.target.value
    }))
  })), /*#__PURE__*/React.createElement("div", {
    className: "field",
    style: {
      margin: 0
    }
  }, /*#__PURE__*/React.createElement("label", null, "Reminder note"), /*#__PURE__*/React.createElement("input", {
    type: "text",
    placeholder: "e.g. Call about site visit",
    value: followUp.note,
    onChange: e => setFollowUp(f => ({
      ...f,
      note: e.target.value
    }))
  })), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary btn-sm",
    disabled: savingFollowUp,
    onClick: saveFollowUp
  }, savingFollowUp ? 'Saving…' : 'Save'), customer.followUpAt && /*#__PURE__*/React.createElement("div", {
    style: {
      gridColumn: '1 / -1',
      fontSize: 12,
      color: isOverdue(customer.followUpAt) ? '#c0392b' : isDueToday(customer.followUpAt) ? '#b7791f' : 'var(--ink-3)'
    }
  }, isOverdue(customer.followUpAt) ? '🔴 Overdue' : isDueToday(customer.followUpAt) ? '🟡 Due today' : '📅 Upcoming', ' — ', customer.followUpAt, customer.followUpNote ? `: ${customer.followUpNote}` : '')), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "text",
    placeholder: "Add a note about this customer…",
    style: {
      flex: 1
    },
    value: noteText,
    onChange: e => setNoteText(e.target.value),
    onKeyDown: e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addNote();
      }
    }
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary btn-sm",
    disabled: addingNote || !noteText.trim(),
    onClick: addNote
  }, addingNote ? 'Adding…' : '+ Add note')), activity.length === 0 ? /*#__PURE__*/React.createElement("div", {
    className: "empty"
  }, "No activity yet — notes, stage changes, and payments will show up here.") : /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, activity.map((a, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: 'flex',
      gap: 10,
      fontSize: 13,
      paddingBottom: 10,
      borderBottom: i < activity.length - 1 ? '1px solid var(--border,#eee)' : 'none'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flexShrink: 0,
      width: 20,
      textAlign: 'center'
    }
  }, a.kind === 'payment' ? '💵' : a.kind === 'system' ? '↻' : '📝'), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", null, a.text), /*#__PURE__*/React.createElement("div", {
    style: {
      color: 'var(--ink-3)',
      fontSize: 11,
      marginTop: 2
    }
  }, a.author ? `${a.author} · ` : '', a.at ? new Date(a.at).toLocaleString('en-PH') : ''))))))), /*#__PURE__*/React.createElement("div", {
    className: "modal-actions"
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "btn btn-outline",
    onClick: () => window.print()
  }, "🖨 Print record"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "btn btn-outline",
    onClick: onClose
  }, "Close"))), /*#__PURE__*/React.createElement("div", {
    className: "print-sheet"
  }, /*#__PURE__*/React.createElement("div", {
    className: "letterhead"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "brand"
  }, "Golden Harmonic Memorial Park"), /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, "Customer Record — Internal Records")), /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, "Printed: ", new Date().toLocaleString('en-PH'))), /*#__PURE__*/React.createElement("h2", null, "Customer Information"), /*#__PURE__*/React.createElement("div", {
    className: "meta-grid"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", null, "Name: "), /*#__PURE__*/React.createElement("strong", null, customer.fullName || `${customer.firstName} ${customer.lastName}`)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", null, "Pipeline stage: "), /*#__PURE__*/React.createElement("strong", null, STAGE_LABEL[normalizeStage(customer.status)])), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", null, "Email: "), customer.email || '—'), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", null, "Phone: "), customer.phone || '—'), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", null, "Preferred location: "), customer.preferredLocation || '—'), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", null, "Interest: "), customer.interest || '—'), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", null, "Lead source: "), customer.source || '—'), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", null, "Date added: "), customer.createdAt && customer.createdAt.toDate ? customer.createdAt.toDate().toLocaleDateString('en-PH') : customer.createdAt ? new Date(customer.createdAt).toLocaleDateString('en-PH') : '—')), customer.plan && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("h2", null, "Plan Details"), customer.plan.imageUrl && /*#__PURE__*/React.createElement("img", {
    src: customer.plan.imageUrl,
    alt: customer.plan.tierName,
    style: {
      width: '100%',
      maxHeight: 220,
      objectFit: 'cover',
      borderRadius: 6,
      marginBottom: 10
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "meta-grid"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", null, "Plan: "), /*#__PURE__*/React.createElement("strong", null, customer.plan.tierName)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", null, "Term: "), customer.plan.termLabel || '—'), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", null, "Plan price: "), fmt(customer.plan.price)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", null, "Monthly amount: "), fmt(customer.plan.monthlyAmount), "/mo"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", null, "Total paid to date: "), fmt(bal.paid)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", null, "Remaining balance: "), fmt(bal.balance)))), payments.length > 0 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("h2", null, "Payment History"), /*#__PURE__*/React.createElement("table", null, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Date"), /*#__PURE__*/React.createElement("th", null, "Amount"), /*#__PURE__*/React.createElement("th", null, "Method"), /*#__PURE__*/React.createElement("th", null, "Note"))), /*#__PURE__*/React.createElement("tbody", null, payments.map((p, i) => /*#__PURE__*/React.createElement("tr", {
    key: i
  }, /*#__PURE__*/React.createElement("td", null, p.date), /*#__PURE__*/React.createElement("td", null, fmt(p.amount)), /*#__PURE__*/React.createElement("td", null, p.method), /*#__PURE__*/React.createElement("td", null, p.note || '—')))))), customer.followUpAt && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("h2", null, "Follow-up"), /*#__PURE__*/React.createElement("div", {
    className: "meta-grid"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", null, "Date: "), customer.followUpAt), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", null, "Note: "), customer.followUpNote || '—'))), /*#__PURE__*/React.createElement("h2", null, "Activity & Notes"), activity.length === 0 ? /*#__PURE__*/React.createElement("div", {
    className: "activity-item"
  }, "No activity recorded.") : activity.map((a, i) => /*#__PURE__*/React.createElement("div", {
    className: "activity-item",
    key: i
  }, /*#__PURE__*/React.createElement("strong", null, a.at ? new Date(a.at).toLocaleString('en-PH') : '—'), " — ", a.text, a.author ? ` (${a.author})` : '')), /*#__PURE__*/React.createElement("div", {
    className: "footer-note"
  }, "This record was generated from the Golden Harmonic Memorial Park CRM for internal filing purposes.")));
}

// ── Products panel ─────────────────────────────────────────────────────────
function Products() {
  const [products, setProducts] = useState(null);
  const [toast, setToast] = useState('');
  const [saving, setSaving] = useState({});
  const [saved, setSaved] = useState({});
  const [local, setLocal] = useState({}); // unsaved edits

  useEffect(() => {
    return window.db.collection('products').orderBy('sortOrder').onSnapshot(snap => {
      if (snap.empty) {
        setProducts([]);
        return;
      }
      const rows = snap.docs.map(d => ({
        _id: d.id,
        ...d.data()
      }));
      setProducts(rows);
      const init = {};
      rows.forEach(r => {
        init[r._id] = {
          price: r.price,
          imageUrl: r.imageUrl || ''
        };
      });
      setLocal(init);
    });
  }, []);
  const seedProducts = async () => {
    if (!confirm('This will reset prices/descriptions to the default 7 plot types. Photo URLs you\'ve already set will be kept. Continue?')) return;
    const batch = window.db.batch();
    BASE_TIERS.forEach(tier => {
      const ref = window.db.collection('products').doc(tier.id);
      batch.set(ref, tier, {
        merge: true
      }); // merge: true keeps fields like imageUrl that aren't in BASE_TIERS
    });
    await batch.commit();
    setToast('Products reset — photos kept ✓');
  };
  const saveProduct = async prod => {
    const edits = local[prod._id];
    if (!edits) return;
    setSaving(s => ({
      ...s,
      [prod._id]: true
    }));
    try {
      await window.db.collection('products').doc(prod._id).update({
        price: Number(edits.price),
        imageUrl: edits.imageUrl || ''
      });
      setSaved(s => ({
        ...s,
        [prod._id]: true
      }));
      setTimeout(() => setSaved(s => ({
        ...s,
        [prod._id]: false
      })), 2000);
    } catch (ex) {
      setToast('Save failed — check console.');
    } finally {
      setSaving(s => ({
        ...s,
        [prod._id]: false
      }));
    }
  };
  const setVal = (id, k, v) => setLocal(l => ({
    ...l,
    [id]: {
      ...l[id],
      [k]: v
    }
  }));
  if (!products) return /*#__PURE__*/React.createElement("div", {
    className: "loading"
  }, /*#__PURE__*/React.createElement("div", {
    className: "spinner"
  }), /*#__PURE__*/React.createElement("div", null, "Loading products…"));
  return /*#__PURE__*/React.createElement(React.Fragment, null, toast && /*#__PURE__*/React.createElement(Toast, {
    msg: toast,
    onDone: () => setToast('')
  }), /*#__PURE__*/React.createElement("div", {
    className: "section-hd"
  }, /*#__PURE__*/React.createElement("h2", null, "Products & Pricing"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-outline btn-sm",
    onClick: seedProducts
  }, products.length === 0 ? '⬆ Seed default products' : '↺ Reset to defaults')), products.length === 0 ? /*#__PURE__*/React.createElement("div", {
    className: "table-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "empty"
  }, "No products in database yet.", /*#__PURE__*/React.createElement("br", null), "Click \"Seed default products\" to push your 7 standard plot types to Firestore.", /*#__PURE__*/React.createElement("br", null), "After seeding, price changes here will reflect live on your website.")) : /*#__PURE__*/React.createElement("div", {
    className: "products-grid"
  }, products.map(p => {
    const ed = local[p._id] || {
      price: p.price
    };
    const price = Number(ed.price) || 0;
    return /*#__PURE__*/React.createElement("div", {
      key: p._id,
      className: "product-card"
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11,
        color: 'var(--ink-3)',
        textTransform: 'uppercase',
        letterSpacing: '.04em',
        marginBottom: 2
      }
    }, p.category), /*#__PURE__*/React.createElement("h3", null, p.name), /*#__PURE__*/React.createElement("p", {
      className: "product-desc"
    }, p.desc), ed.imageUrl && /*#__PURE__*/React.createElement("img", {
      src: ed.imageUrl,
      alt: p.name,
      style: {
        width: '100%',
        height: 120,
        objectFit: 'cover',
        borderRadius: 8,
        marginBottom: 10
      },
      onError: e => e.target.style.display = 'none'
    }), /*#__PURE__*/React.createElement("div", {
      className: "price-edit"
    }, /*#__PURE__*/React.createElement("label", null, "Photo URL"), /*#__PURE__*/React.createElement("input", {
      type: "text",
      value: ed.imageUrl || '',
      placeholder: "https://…",
      onChange: e => setVal(p._id, 'imageUrl', e.target.value)
    })), /*#__PURE__*/React.createElement("div", {
      className: "price-edit"
    }, /*#__PURE__*/React.createElement("label", null, "Spot cash price (₱)"), /*#__PURE__*/React.createElement("input", {
      type: "number",
      value: ed.price,
      onChange: e => setVal(p._id, 'price', e.target.value)
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        color: 'var(--ink-3)',
        margin: '10px 0',
        lineHeight: 1.6
      }
    }, "No down payment — surcharge + term applies:", /*#__PURE__*/React.createElement("br", null), PLAN_TERMS.slice(1).map(t => /*#__PURE__*/React.createElement("span", {
      key: t.key,
      style: {
        display: 'inline-block',
        marginRight: 12
      }
    }, t.label.replace(' Plan', ''), ": ", fmt(Math.round(price * (1 + t.surcharge) / t.months)), "/mo"))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginTop: 12
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn btn-primary btn-sm",
      disabled: saving[p._id],
      onClick: () => saveProduct(p)
    }, saving[p._id] ? 'Saving…' : 'Save'), /*#__PURE__*/React.createElement("span", {
      className: "save-indicator"
    }, saved[p._id] && /*#__PURE__*/React.createElement("span", {
      className: "save-ok"
    }, "✓ Saved"))));
  })));
}

// ── Security panel (self-service TOTP 2FA enrollment) ───────────────────────
// Renders a QR code into a plain div using the qrcodejs library (global
// `QRCode`, loaded via CDN in admin.html). Kept as its own small component so
// the QR widget can be torn down/recreated cleanly when the secret changes.
function TotpQr({
  uri
}) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = '';
    new QRCode(ref.current, {
      text: uri,
      width: 180,
      height: 180,
      colorDark: '#1a2822',
      colorLight: '#ffffff'
    });
  }, [uri]);
  return /*#__PURE__*/React.createElement("div", {
    ref: ref,
    style: {
      display: 'inline-block',
      padding: 12,
      background: '#fff',
      borderRadius: 10,
      border: '1px solid var(--border)'
    }
  });
}
function Security({
  user,
  myDoc
}) {
  const linked = !!(myDoc && !myDoc.unlinked);
  const enabled = !!(myDoc && myDoc.totpEnabled);
  const [enrolling, setEnrolling] = useState(false);
  const [secret, setSecret] = useState(null); // OTPAuth.Secret instance while enrolling
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const startEnroll = () => {
    const s = new OTPAuth.Secret({
      size: 20
    });
    setSecret(s);
    setEnrolling(true);
    setCode('');
    setErr('');
  };
  const cancelEnroll = () => {
    setEnrolling(false);
    setSecret(null);
    setCode('');
    setErr('');
  };
  const confirmEnroll = async e => {
    e.preventDefault();
    setErr('');
    if (!verifyTotpCode(secret.base32, code)) {
      setErr("That code didn't match — double-check your authenticator app and try again.");
      return;
    }
    setBusy(true);
    try {
      await window.db.collection('users').doc(user.uid).set({
        totpEnabled: true,
        totpSecret: secret.base32
      }, {
        merge: true
      });
      setEnrolling(false);
      setSecret(null);
      setCode('');
      setToast('Two-factor authentication is on for your account.');
    } catch (ex) {
      console.error('[GH totp] enroll save failed', ex);
      setErr(ex.message || 'Could not save — try again.');
    } finally {
      setBusy(false);
    }
  };
  const disable = async () => {
    if (!confirm("Turn off two-factor authentication for your own account? You'll only need your password to sign in after this.")) return;
    setBusy(true);
    try {
      await window.db.collection('users').doc(user.uid).update({
        totpEnabled: false,
        totpSecret: firebase.firestore.FieldValue.delete()
      });
      setToast('Two-factor authentication turned off.');
    } catch (ex) {
      console.error('[GH totp] disable failed', ex);
      alert(ex.message || 'Could not turn it off — try again.');
    } finally {
      setBusy(false);
    }
  };
  const otpUri = secret ? `otpauth://totp/Golden%20Harmonic:${encodeURIComponent(user.email)}?secret=${secret.base32}&issuer=Golden%20Harmonic&algorithm=SHA1&digits=6&period=30` : '';
  if (!linked) {
    return /*#__PURE__*/React.createElement("div", {
      className: "table-card"
    }, /*#__PURE__*/React.createElement("div", {
      className: "empty"
    }, "Your account isn't linked to a Users record yet, so there's nowhere to save a 2FA secret. Ask a Super Admin to link your account on the Users tab, then come back here."));
  }
  return /*#__PURE__*/React.createElement(React.Fragment, null, toast && /*#__PURE__*/React.createElement(Toast, {
    msg: toast,
    onDone: () => setToast('')
  }), /*#__PURE__*/React.createElement("div", {
    className: "section-hd"
  }, /*#__PURE__*/React.createElement("h2", null, "Two-Factor Authentication")), /*#__PURE__*/React.createElement("div", {
    className: "table-card",
    style: {
      padding: 24
    }
  }, !enrolling && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 13,
      color: 'var(--ink-2)',
      marginBottom: 16,
      lineHeight: 1.6
    }
  }, enabled ? 'Two-factor authentication is on for your account. Each time you sign in, you\'ll also need a 6-digit code from your authenticator app.' : "Add a second step to your login using an authenticator app (Google Authenticator, Authy, etc.) — even if someone gets your password, they can't sign in without your phone too."), enabled ? /*#__PURE__*/React.createElement("button", {
    className: "btn btn-danger btn-sm",
    disabled: busy,
    onClick: disable
  }, "Turn off 2FA") : /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary btn-sm",
    onClick: startEnroll
  }, "Set up 2FA")), enrolling && /*#__PURE__*/React.createElement("form", {
    onSubmit: confirmEnroll
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      marginBottom: 12
    }
  }, "1. Scan this with your authenticator app"), /*#__PURE__*/React.createElement(TotpQr, {
    uri: otpUri
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 11,
      color: 'var(--ink-3)',
      marginTop: 10,
      marginBottom: 20
    }
  }, "Can't scan? Enter this key manually: ", /*#__PURE__*/React.createElement("code", {
    style: {
      background: '#f8faf9',
      padding: '2px 6px',
      borderRadius: 4
    }
  }, secret.base32)), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      marginBottom: 8
    }
  }, "2. Enter the 6-digit code it shows you"), /*#__PURE__*/React.createElement("div", {
    className: "field",
    style: {
      maxWidth: 200
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "text",
    inputMode: "numeric",
    autoFocus: true,
    maxLength: 6,
    placeholder: "123456",
    style: {
      letterSpacing: '4px',
      fontSize: 18,
      textAlign: 'center'
    },
    value: code,
    onChange: e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
  })), err && /*#__PURE__*/React.createElement("p", {
    className: "err-msg"
  }, err), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      marginTop: 16
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary btn-sm",
    type: "submit",
    disabled: busy || code.length !== 6
  }, busy ? 'Confirming…' : 'Confirm & turn on'), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-outline btn-sm",
    type: "button",
    onClick: cancelEnroll
  }, "Cancel")))));
}

// ── Users panel ────────────────────────────────────────────────────────────
function Users({
  currentUser,
  currentRole
}) {
  const [users, setUsers] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [toast, setToast] = useState('');
  const isSuperAdmin = currentRole === 'superadmin';
  useEffect(() => {
    return window.db.collection('users').orderBy('createdAt', 'desc').onSnapshot(snap => setUsers(snap.docs.map(d => ({
      _id: d.id,
      ...d.data()
    }))));
  }, []);
  const removeUser = async (id, email, role) => {
    if (email === currentUser.email) {
      alert("You can't remove yourself.");
      return;
    }
    if (role === 'superadmin' && !isSuperAdmin) {
      alert("Only a Super Admin can remove a Super Admin account.");
      return;
    }
    if (!confirm(`Remove ${email} from the admin list?`)) return;
    await window.db.collection('users').doc(id).delete();
    setToast('User removed from records');
  };
  // Lost-phone recovery: turn 2FA back off for someone else's account so they
  // can sign in with just their password and re-enroll on their own device —
  // mirrors the manual UID-linking recovery pattern used elsewhere here.
  const resetTotp = async (id, email) => {
    if (!confirm(`Turn off two-factor authentication for ${email}? They'll be able to sign in with just their password until they set it up again.`)) return;
    await window.db.collection('users').doc(id).update({
      totpEnabled: false,
      totpSecret: firebase.firestore.FieldValue.delete()
    });
    setToast('2FA reset — they can set it up again from the Security tab.');
  };
  return /*#__PURE__*/React.createElement(React.Fragment, null, toast && /*#__PURE__*/React.createElement(Toast, {
    msg: toast,
    onDone: () => setToast('')
  }), showAdd && /*#__PURE__*/React.createElement(AddUserModal, {
    currentRole: currentRole,
    onClose: () => setShowAdd(false),
    onSaved: () => {
      setShowAdd(false);
      setToast('User record added');
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "section-hd"
  }, /*#__PURE__*/React.createElement("h2", null, "Admin Users"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary btn-sm",
    onClick: () => setShowAdd(true)
  }, "+ Add user")), /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff8e1',
      border: '1px solid #ffe082',
      borderRadius: 8,
      padding: '12px 16px',
      fontSize: 13,
      color: '#795548',
      marginBottom: 16
    }
  }, "💡 First create the real login in ", /*#__PURE__*/React.createElement("strong", null, "Firebase Console → Authentication → Add user"), ", then copy that user's ", /*#__PURE__*/React.createElement("strong", null, "UID"), " and paste it below. The role only takes effect — both here and in Firestore security rules — when this record's ID matches their Auth UID.", !isSuperAdmin && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("br", null), "🔒 As an Admin, you can manage Staff and Admin accounts. Super Admin accounts are visible but locked to you.")), /*#__PURE__*/React.createElement("div", {
    className: "users-grid"
  }, users.length === 0 && /*#__PURE__*/React.createElement("div", {
    className: "table-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "empty"
  }, "No users recorded yet. Add your admin accounts above.")), users.map(u => {
    const locked = u.role === 'superadmin' && !isSuperAdmin;
    return /*#__PURE__*/React.createElement("div", {
      key: u._id,
      className: "user-row"
    }, /*#__PURE__*/React.createElement("div", {
      className: "user-info"
    }, /*#__PURE__*/React.createElement("div", {
      className: "user-avatar"
    }, initials(u.name || u.email)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      className: "user-name"
    }, u.name || '(no name)'), /*#__PURE__*/React.createElement("div", {
      className: "user-email"
    }, u.email, " · ", /*#__PURE__*/React.createElement("em", null, u.role || 'admin'), u.totpEnabled && /*#__PURE__*/React.createElement("span", {
      style: {
        marginLeft: 8,
        color: 'var(--green)',
        fontWeight: 600
      }
    }, "🔒 2FA on")))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 8
      }
    }, u.totpEnabled && /*#__PURE__*/React.createElement("button", {
      className: "btn btn-outline btn-sm",
      onClick: () => resetTotp(u._id, u.email)
    }, "Reset 2FA"), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-danger btn-sm",
      disabled: locked,
      title: locked ? 'Only a Super Admin can remove this account' : '',
      onClick: () => removeUser(u._id, u.email, u.role)
    }, "Remove")));
  })));
}
function AddUserModal({
  onClose,
  onSaved,
  currentRole
}) {
  const [form, setForm] = useState({
    uid: '',
    name: '',
    email: '',
    role: 'staff'
  });
  const [busy, setBusy] = useState(false);
  const set = k => e => setForm(f => ({
    ...f,
    [k]: e.target.value
  }));
  const canGrantSuperAdmin = currentRole === 'superadmin';
  const save = async e => {
    e.preventDefault();
    setBusy(true);
    try {
      const uid = form.uid.trim();
      const {
        uid: _drop,
        ...data
      } = form;
      await window.db.collection('users').doc(uid).set({
        ...data,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      onSaved();
    } finally {
      setBusy(false);
    }
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "modal-bg",
    onClick: e => e.target === e.currentTarget && onClose()
  }, /*#__PURE__*/React.createElement("div", {
    className: "modal"
  }, /*#__PURE__*/React.createElement("h3", null, "Add Admin User"), /*#__PURE__*/React.createElement("form", {
    onSubmit: save
  }, /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", null, "Firebase Auth UID"), /*#__PURE__*/React.createElement("input", {
    required: true,
    value: form.uid,
    onChange: set('uid'),
    placeholder: "Copy from Firebase Console → Authentication"
  })), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", null, "Full name"), /*#__PURE__*/React.createElement("input", {
    required: true,
    value: form.name,
    onChange: set('name'),
    placeholder: "Juan dela Cruz"
  })), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", null, "Email"), /*#__PURE__*/React.createElement("input", {
    type: "email",
    required: true,
    value: form.email,
    onChange: set('email'),
    placeholder: "juan@ghmemorialpark.com"
  })), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", null, "Role"), /*#__PURE__*/React.createElement("select", {
    value: form.role,
    onChange: set('role')
  }, canGrantSuperAdmin && /*#__PURE__*/React.createElement("option", {
    value: "superadmin"
  }, "Super Admin"), /*#__PURE__*/React.createElement("option", {
    value: "admin"
  }, "Admin"), /*#__PURE__*/React.createElement("option", {
    value: "staff"
  }, "Staff")), !canGrantSuperAdmin && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--ink-3)',
      marginTop: 5
    }
  }, "Only a Super Admin can grant the Super Admin role.")), /*#__PURE__*/React.createElement("div", {
    className: "modal-actions"
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "btn btn-outline",
    onClick: onClose
  }, "Cancel"), /*#__PURE__*/React.createElement("button", {
    type: "submit",
    className: "btn btn-primary",
    disabled: busy
  }, busy ? 'Saving…' : 'Add user')))));
}

// ── Recently Deleted panel ───────────────────────────────────────────────────
function RecentlyDeleted({
  currentUser,
  canPurge
}) {
  const [rows, setRows] = useState(null);
  const [toast, setToast] = useState('');
  const [busyId, setBusyId] = useState(null);
  useEffect(() => {
    return window.db.collection('trash').orderBy('deletedAt', 'desc').onSnapshot(snap => setRows(snap.docs.map(d => ({
      _id: d.id,
      ...d.data()
    }))));
  }, []);
  const nameOf = r => r.data && (r.data.fullName || `${r.data.firstName || ''} ${r.data.lastName || ''}`.trim() || r.data.email) || '(no name)';
  const typeLabel = c => c === 'inquiries' ? 'Inquiry' : c === 'customers' ? 'Customer' : c;
  const restore = async r => {
    setBusyId(r._id);
    try {
      await window.db.collection(r.collection).doc(r.originalId).set(r.data);
      await window.db.collection('trash').doc(r._id).delete();
      setToast(`${typeLabel(r.collection)} restored`);
    } finally {
      setBusyId(null);
    }
  };
  const purge = async r => {
    if (!confirm(`Permanently delete this ${typeLabel(r.collection).toLowerCase()} record? This cannot be undone.`)) return;
    setBusyId(r._id);
    try {
      await window.db.collection('trash').doc(r._id).delete();
      setToast('Permanently deleted');
    } finally {
      setBusyId(null);
    }
  };
  if (!rows) return /*#__PURE__*/React.createElement("div", {
    className: "loading"
  }, /*#__PURE__*/React.createElement("div", {
    className: "spinner"
  }), /*#__PURE__*/React.createElement("div", null, "Loading Recently Deleted…"));
  return /*#__PURE__*/React.createElement(React.Fragment, null, toast && /*#__PURE__*/React.createElement(Toast, {
    msg: toast,
    onDone: () => setToast('')
  }), /*#__PURE__*/React.createElement("div", {
    className: "section-hd"
  }, /*#__PURE__*/React.createElement("h2", null, "Recently Deleted ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--ink-3)',
      fontWeight: 400,
      fontSize: 13
    }
  }, "(", rows.length, ")"))), /*#__PURE__*/React.createElement("div", {
    className: "table-card"
  }, rows.length === 0 ? /*#__PURE__*/React.createElement("div", {
    className: "empty"
  }, "Nothing here. Deleted inquiries and customers show up in this list before they're gone for good.") : /*#__PURE__*/React.createElement("table", {
    className: "gh-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Type"), /*#__PURE__*/React.createElement("th", null, "Name"), /*#__PURE__*/React.createElement("th", null, "Email"), /*#__PURE__*/React.createElement("th", null, "Deleted"), /*#__PURE__*/React.createElement("th", null, "Deleted by"), /*#__PURE__*/React.createElement("th", null))), /*#__PURE__*/React.createElement("tbody", null, rows.map(r => /*#__PURE__*/React.createElement("tr", {
    key: r._id
  }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
    className: "plan-badge"
  }, typeLabel(r.collection))), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("strong", null, nameOf(r))), /*#__PURE__*/React.createElement("td", null, r.data && r.data.email || '—'), /*#__PURE__*/React.createElement("td", {
    style: {
      color: 'var(--ink-3)'
    }
  }, r.deletedAt ? new Date(r.deletedAt).toLocaleString('en-PH') : '—'), /*#__PURE__*/React.createElement("td", {
    style: {
      color: 'var(--ink-3)'
    }
  }, r.deletedBy || '—'), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-outline btn-sm",
    disabled: busyId === r._id,
    onClick: () => restore(r)
  }, busyId === r._id ? '…' : '↩ Restore'), canPurge && /*#__PURE__*/React.createElement("button", {
    className: "btn btn-danger btn-sm",
    disabled: busyId === r._id,
    onClick: () => purge(r)
  }, "Delete forever")))))))));
}

// ── PendingPayments: review queue for customer-portal GCash submissions ────
// Customers submit a reference via site.jsx's "Submit a payment reference"
// form, which lands in customer.paymentSubmissions[] with status:'pending'.
// It never touches payments[] on its own — a real staff member has to look
// at it here and either Confirm (which logs it into payments[], the same
// way the manual "Log payment" form does, so the balance updates) or Reject
// (which just flags it so the customer sees "Needs attention").
function PendingPayments({
  currentUser
}) {
  const [rows, setRows] = useState(null);
  const [toast, setToast] = useState('');
  const [busyKey, setBusyKey] = useState(null);
  useEffect(() => {
    return window.db.collection('customers').orderBy('createdAt', 'desc').onSnapshot(snap => setRows(snap.docs.map(d => ({
      _id: d.id,
      ...d.data()
    }))));
  }, []);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(''), 2200);
      return () => clearTimeout(t);
    }
  }, [toast]);
  if (!rows) return /*#__PURE__*/React.createElement("div", {
    className: "loading"
  }, /*#__PURE__*/React.createElement("div", {
    className: "spinner"
  }), /*#__PURE__*/React.createElement("div", null, "Loading pending payments…"));

  // Flatten every customer's paymentSubmissions into one list, oldest first
  const pending = [];
  for (const c of rows) {
    (c.paymentSubmissions || []).forEach(sub => {
      if ((sub.status || 'pending') === 'pending') pending.push({
        customer: c,
        sub
      });
    });
  }
  pending.sort((a, b) => (a.sub.submittedAt || 0) - (b.sub.submittedAt || 0));

  // Wrapped in a transaction so two staff confirming the same submission at
  // nearly the same time can't both push it into payments[] — the second
  // one re-reads fresh data inside the transaction, sees it's no longer
  // 'pending', and bails out with a clear message instead of double-logging
  // the payment and understating the customer's balance.
  const resolve = async (customer, subToResolve, action) => {
    const key = customer._id + '_' + subToResolve.submittedAt;
    setBusyKey(key);
    try {
      const ref = window.db.collection('customers').doc(customer._id);
      await window.db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error('That customer record no longer exists.');
        const data = snap.data();
        const current = (data.paymentSubmissions || []).find(s => s.submittedAt === subToResolve.submittedAt);
        if (!current) throw new Error('That submission is gone — it may have already been removed.');
        if ((current.status || 'pending') !== 'pending') {
          throw new Error(`Already marked "${current.status}" — probably by another staff member.`);
        }
        const nextSubmissions = (data.paymentSubmissions || []).map(s => s.submittedAt === subToResolve.submittedAt ? {
          ...s,
          status: action === 'confirm' ? 'confirmed' : 'rejected'
        } : s);
        const updates = {
          paymentSubmissions: nextSubmissions
        };
        if (action === 'confirm') {
          updates.payments = firebase.firestore.FieldValue.arrayUnion({
            date: current.date,
            amount: Number(current.amount),
            method: current.method || 'GCash',
            note: `Ref ${current.referenceNumber}${current.mobileNumber ? ' · ' + current.mobileNumber : ''} — confirmed from customer portal by ${currentUser && currentUser.email || 'staff'}`
          });
        }
        tx.update(ref, updates);
      });
      setToast(action === 'confirm' ? 'Payment confirmed — balance updated' : 'Marked as needing attention');
    } catch (err) {
      setToast(err && err.message || 'Could not update');
    } finally {
      setBusyKey(null);
    }
  };
  return /*#__PURE__*/React.createElement("div", null, toast && /*#__PURE__*/React.createElement(Toast, {
    msg: toast,
    onDone: () => setToast('')
  }), /*#__PURE__*/React.createElement("div", {
    className: "section-hd"
  }, /*#__PURE__*/React.createElement("h2", null, "Pending Payments ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--ink-3)',
      fontWeight: 400,
      fontSize: 13
    }
  }, "(", pending.length, ")"))), /*#__PURE__*/React.createElement("div", {
    className: "table-card"
  }, pending.length === 0 ? /*#__PURE__*/React.createElement("div", {
    className: "empty"
  }, "No pending payment submissions right now. New GCash references from the customer portal will show up here.") : /*#__PURE__*/React.createElement("table", {
    className: "gh-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Customer"), /*#__PURE__*/React.createElement("th", null, "Reference"), /*#__PURE__*/React.createElement("th", null, "Amount"), /*#__PURE__*/React.createElement("th", null, "Payment date"), /*#__PURE__*/React.createElement("th", null, "Submitted"), /*#__PURE__*/React.createElement("th", null))), /*#__PURE__*/React.createElement("tbody", null, pending.map(({
    customer,
    sub
  }) => {
    const key = customer._id + '_' + sub.submittedAt;
    const isBusy = busyKey === key;
    return /*#__PURE__*/React.createElement("tr", {
      key: key
    }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("strong", null, customer.fullName || `${customer.firstName || ''} ${customer.lastName || ''}`), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        color: 'var(--ink-3)'
      }
    }, customer.email)), /*#__PURE__*/React.createElement("td", null, sub.referenceNumber, sub.mobileNumber && /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        color: 'var(--ink-3)'
      }
    }, sub.mobileNumber)), /*#__PURE__*/React.createElement("td", null, fmt(sub.amount)), /*#__PURE__*/React.createElement("td", null, sub.date), /*#__PURE__*/React.createElement("td", {
      style: {
        fontSize: 12,
        color: 'var(--ink-3)'
      }
    }, sub.submittedAt ? new Date(sub.submittedAt).toLocaleString() : '—'), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 6
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn btn-primary btn-sm",
      disabled: isBusy,
      onClick: () => resolve(customer, sub, 'confirm')
    }, isBusy ? '…' : '✓ Confirm'), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-outline btn-sm",
      disabled: isBusy,
      onClick: () => resolve(customer, sub, 'reject')
    }, "Reject"))));
  })))));
}

// ── Dashboard ──────────────────────────────────────────────────────────────
const TABS = [{
  id: 'pipeline',
  label: 'Pipeline',
  ico: '🧭',
  badge: 1
}, {
  id: 'inquiries',
  label: 'Inquiries',
  ico: '📥',
  badge: 5
}, {
  id: 'customers',
  label: 'Customers',
  ico: '👥',
  badge: 2
}, {
  id: 'pending',
  label: 'Pending Payments',
  ico: '⏳',
  badge: 4
}, {
  id: 'products',
  label: 'Products',
  ico: '🪦',
  badge: 3
}, {
  id: 'users',
  label: 'Users',
  ico: '🔐',
  badge: 4
}, {
  id: 'trash',
  label: 'Recently Deleted',
  ico: '🗑️',
  badge: 1
}, {
  id: 'security',
  label: 'Security',
  ico: '🔒',
  badge: 5
}];
function Dashboard({
  user,
  onLogout
}) {
  const [tab, setTab] = useState('pipeline');
  const [menuOpen, setMenuOpen] = useState(false);
  // Close the mobile drawer whenever a tab is picked, so navigating always
  // lands back on the content instead of leaving the sidebar hanging open.
  const selectTab = id => {
    setTab(id);
    setMenuOpen(false);
  };
  const [counts, setCounts] = useState({
    inquiries: 0,
    customers: 0,
    products: 0,
    users: 0,
    trash: 0,
    pending: 0
  });
  // myRole is looked up from users/{uid} — the doc ID MUST equal the Firebase Auth UID
  // for this (and the Firestore security rules) to work. 'unlinked' means this login
  // has no matching users/{uid} record yet — see the banner on the Users tab.
  const [myDoc, setMyDoc] = useState(null);
  useEffect(() => {
    return window.db.collection('users').doc(user.uid).onSnapshot(doc => {
      setMyDoc(doc.exists ? doc.data() : {
        unlinked: true
      });
    });
  }, [user.uid]);
  const myRole = myDoc ? myDoc.unlinked ? 'unlinked' : myDoc.role || 'staff' : null;
  const isSuperAdmin = myRole === 'superadmin';
  const isAdminOrHigher = myRole === 'admin' || myRole === 'superadmin';
  const visibleTabs = TABS.filter(t => (t.id !== 'users' || isAdminOrHigher) && (t.id !== 'products' || isAdminOrHigher));
  useEffect(() => {
    const unsubs = ['inquiries', 'customers', 'products', 'users', 'trash'].map(col => window.db.collection(col).onSnapshot(s => setCounts(c => ({
      ...c,
      [col]: s.size
    }))));
    // 'pending' isn't its own collection — it's a count of paymentSubmissions
    // with status:'pending' nested inside every customer doc, so it needs
    // its own listener that reduces across all customers.
    const pendingUnsub = window.db.collection('customers').onSnapshot(snap => {
      let n = 0;
      snap.docs.forEach(d => {
        (d.data().paymentSubmissions || []).forEach(s => {
          if ((s.status || 'pending') === 'pending') n++;
        });
      });
      setCounts(c => ({
        ...c,
        pending: n
      }));
    });
    return () => {
      unsubs.forEach(u => u());
      pendingUnsub();
    };
  }, []);
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: `sidebar-backdrop ${menuOpen ? 'open' : ''}`,
    onClick: () => setMenuOpen(false)
  }), /*#__PURE__*/React.createElement("div", {
    className: "layout"
  }, /*#__PURE__*/React.createElement("aside", {
    className: `sidebar ${menuOpen ? 'open' : ''}`
  }, /*#__PURE__*/React.createElement("div", {
    className: "sidebar-logo"
  }, /*#__PURE__*/React.createElement("img", {
    src: "/logo-header.png",
    alt: "Golden Harmonic logo",
    style: {
      width: 34,
      height: 34,
      objectFit: 'contain',
      flexShrink: 0
    }
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "sidebar-name"
  }, "Golden Harmonic"), /*#__PURE__*/React.createElement("div", {
    className: "sidebar-sub"
  }, "Admin Panel"))), /*#__PURE__*/React.createElement("div", {
    className: "sidebar-divider"
  }), /*#__PURE__*/React.createElement("div", {
    className: "sidebar-section"
  }, "Management"), /*#__PURE__*/React.createElement("nav", {
    className: "sidebar-nav"
  }, visibleTabs.map(t => /*#__PURE__*/React.createElement("div", {
    key: t.id,
    className: `nav-item ${tab === t.id ? 'active' : ''}`,
    onClick: () => selectTab(t.id)
  }, /*#__PURE__*/React.createElement("span", {
    className: "ico"
  }, t.ico), /*#__PURE__*/React.createElement("span", null, t.label), counts[t.id] > 0 && /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 'auto',
      background: 'rgba(255,255,255,.2)',
      fontSize: 10,
      fontWeight: 700,
      padding: '2px 7px',
      borderRadius: 10
    }
  }, counts[t.id])))), /*#__PURE__*/React.createElement("div", {
    className: "sidebar-footer"
  }, /*#__PURE__*/React.createElement("button", {
    className: "logout-btn",
    onClick: onLogout
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 16
    }
  }, "🚪"), " Sign out"))), /*#__PURE__*/React.createElement("div", {
    className: "main"
  }, /*#__PURE__*/React.createElement("div", {
    className: "topbar"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "menu-btn",
    onClick: () => setMenuOpen(true),
    "aria-label": "Open menu"
  }, "☰"), /*#__PURE__*/React.createElement("div", {
    className: "topbar-title"
  }, TABS.find(t => t.id === tab)?.label)), /*#__PURE__*/React.createElement("div", {
    className: "topbar-right"
  }, /*#__PURE__*/React.createElement("span", {
    className: "user-badge"
  }, "Signed in as ", /*#__PURE__*/React.createElement("strong", null, user.email), myRole && myRole !== 'unlinked' ? ` · ${myRole}` : ''))), /*#__PURE__*/React.createElement("div", {
    className: "content"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stats-row"
  }, visibleTabs.filter(t => t.id !== 'pipeline' && t.id !== 'trash' && t.id !== 'security').map(t => /*#__PURE__*/React.createElement("div", {
    key: t.id,
    className: "stat-card",
    style: {
      cursor: 'pointer'
    },
    onClick: () => setTab(t.id)
  }, /*#__PURE__*/React.createElement("div", {
    className: "stat-badge",
    style: {
      background: `var(--badge-${t.badge})`,
      color: `var(--badge-${t.badge}-ic)`
    }
  }, t.ico), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "stat-num"
  }, counts[t.id]), /*#__PURE__*/React.createElement("div", {
    className: "stat-lbl"
  }, t.label))))), tab === 'pipeline' && /*#__PURE__*/React.createElement(Pipeline, {
    currentUser: user
  }), tab === 'inquiries' && /*#__PURE__*/React.createElement(Inquiries, {
    currentUser: user
  }), tab === 'customers' && /*#__PURE__*/React.createElement(Customers, {
    currentUser: user
  }), tab === 'pending' && /*#__PURE__*/React.createElement(PendingPayments, {
    currentUser: user
  }), tab === 'products' && isAdminOrHigher && /*#__PURE__*/React.createElement(Products, null), tab === 'users' && isAdminOrHigher && /*#__PURE__*/React.createElement(Users, {
    currentUser: user,
    currentRole: myRole
  }), tab === 'trash' && /*#__PURE__*/React.createElement(RecentlyDeleted, {
    currentUser: user,
    canPurge: isAdminOrHigher
  }), tab === 'security' && /*#__PURE__*/React.createElement(Security, {
    user: user,
    myDoc: myDoc
  })))));
}

// ── Root ───────────────────────────────────────────────────────────────────
function Root() {
  const [user, setUser] = useState(undefined); // undefined = checking

  useEffect(() => {
    return window.auth.onAuthStateChanged(u => setUser(u || null));
  }, []);
  const logout = () => window.auth.signOut();
  if (user === undefined) return /*#__PURE__*/React.createElement("div", {
    className: "loading",
    style: {
      minHeight: '100vh',
      display: 'grid',
      placeItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "spinner"
  }), /*#__PURE__*/React.createElement("div", null, "Checking login…")));
  if (!user) return /*#__PURE__*/React.createElement(Login, {
    onLogin: setUser
  });
  return /*#__PURE__*/React.createElement(Dashboard, {
    user: user,
    onLogout: logout
  });
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(Root, null));
