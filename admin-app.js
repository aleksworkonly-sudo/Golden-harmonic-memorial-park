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
}, {
  id: 'valor',
  name: 'Valor Plot',
  category: 'Family Vault',
  price: 40000,
  sortOrder: 8,
  desc: 'A dignified resting place honoring those who served — veterans and service members.',
  features: ['2 interment spaces', 'Perpetual care included', 'Memorial marker with laurel emblem'],
  label: 'valor plot — memorial marker'
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
// Block layout from Golden Harmonic's master site plan: lettered lawn
// blocks A–H (H is smaller — clipped by the park boundary) plus a
// separate Mausoleum block. `productId` must match an id in the
// `products` collection (Products tab) — defaulted to 'regular' for
// A–H since the site plan doesn't call out per-block plot tiers; adjust
// any block that's actually Premium/Corner Premium once confirmed.
// NOTE: the site plan also shows separate "Garden Plots" and "Valor
// Plots" areas near the center — not included here yet since it's
// unclear whether those should be their own blocks in this grid.
const PLOT_BLOCKS = [{
  id: 'A',
  label: 'Block A',
  size: 2000,
  productId: 'regular'
}, {
  id: 'B',
  label: 'Block B',
  size: 2000,
  productId: 'regular'
}, {
  id: 'C',
  label: 'Block C',
  size: 2000,
  productId: 'regular'
}, {
  id: 'D',
  label: 'Block D',
  size: 2000,
  productId: 'regular'
}, {
  id: 'E',
  label: 'Block E',
  size: 2000,
  productId: 'regular'
}, {
  id: 'F',
  label: 'Block F',
  size: 2000,
  productId: 'regular'
}, {
  id: 'G',
  label: 'Block G',
  size: 2000,
  productId: 'regular'
}, {
  id: 'H',
  label: 'Block H',
  size: 978,
  productId: 'regular'
}, {
  id: 'M',
  label: 'Mausoleum',
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
  onToast,
  jumpTo,
  onJumpHandled
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
  // Jumping here from a customer row: land on their block/page and open
  // the slot detail as soon as that block's plots have loaded.
  useEffect(() => {
    if (!jumpTo) return;
    setBlockId(jumpTo.blockId);
    setPage(Math.floor((jumpTo.lotNo - 1) / PLOT_PAGE_SIZE));
    setDetailSlot(jumpTo.lotNo);
    onJumpHandled && onJumpHandled();
  }, [jumpTo]);
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
  const [plotsIndex, setPlotsIndex] = useState({});
  const [jumpTo, setJumpTo] = useState(null);
  useEffect(() => {
    return window.db.collection('customers').orderBy('createdAt', 'desc').onSnapshot(snap => setRows(snap.docs.map(d => ({
      _id: d.id,
      ...d.data()
    }))));
  }, []);
  // Sparse collection (only assigned slots have a doc), so reading it in
  // full here is cheap and lets each customer row show its plot, if any.
  useEffect(() => {
    return window.db.collection('plots').onSnapshot(snap => {
      const map = {};
      snap.docs.forEach(d => {
        const data = d.data();
        if (data.customerId) map[data.customerId] = data;
      });
      setPlotsIndex(map);
    });
  }, []);
  const goToPlot = plot => {
    setView('plots');
    setJumpTo({
      blockId: plot.blockId,
      lotNo: plot.lotNo
    });
  };
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
    onToast: setToast,
    jumpTo: jumpTo,
    onJumpHandled: () => setJumpTo(null)
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
    }, "View"), /*#__PURE__*/React.createElement(CustomerSheetButton, {
      customer: r,
      plot: plotsIndex[r._id],
      onToast: setToast
    }), plotsIndex[r._id] && /*#__PURE__*/React.createElement("button", {
      className: "btn btn-gold btn-sm",
      title: `Block ${plotsIndex[r._id].blockId}, Lot ${plotsIndex[r._id].lotNo}`,
      onClick: () => goToPlot(plotsIndex[r._id])
    }, "📍 ", plotsIndex[r._id].blockId, "-", String(plotsIndex[r._id].lotNo).padStart(4, '0')), /*#__PURE__*/React.createElement("button", {
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
  // Sales (presale applications) bought by this customer, matched by mobile number, fill in the printed sheet.
  const [sales, setSales] = useState([]);
  const [sheetQueue, setSheetQueue] = useState([]);
  useEffect(() => {
    const key = String(customer.phone || '').replace(/\D/g, '').slice(-10);
    if (key.length < 10) {
      setSales([]);
      return;
    }
    return window.db.collection('presaleApplications').where('mobileKey', '==', key).onSnapshot(snap => setSales(snap.docs.map(d => ({
      _id: d.id,
      ...d.data()
    })).filter(x => x.status !== 'cancelled')), () => setSales([]));
  }, [customer.phone]);
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
    onClick: () => setSheetQueue(sales.length ? sales.map(sale => ({
      ...customerSheetData(customer, payments),
      ...presaleSheetData(sale)
    })) : [customerSheetData(customer, payments)])
  }, "📝 Customer sheet (edit, then Word)"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "btn btn-outline",
    onClick: onClose
  }, "Close")), sheetQueue.length > 0 && /*#__PURE__*/React.createElement(CustomerSheetEditor, {
    key: sheetQueue.length,
    data: sheetQueue[0],
    onClose: () => setSheetQueue(q => q.slice(1)),
    onToast: onToast
  })));
}

// ── Customer monitoring sheet: the company's own Word form, filled in ──────
// Turns a presale sale (presaleApplications doc) into the fields the paper sheet needs.
function presaleSheetData(a) {
  const plots = presalePlots(a);
  const uniq = arr => [...new Set(arr.filter(v => v !== undefined && v !== null && v !== ''))];
  const pays = (a.payments || []).map(p => ({
    date: p.date,
    ref: p.ref,
    amount: p.amount,
    method: p.method || a.method,
    note: PRESALE_METHOD_LABEL[p.method || a.method] || p.method || a.method || ''
  }));
  const first = [...pays].sort((x, y) => Number(x.date) - Number(y.date))[0];
  return {
    fullName: a.name,
    phone: a.mobile,
    blockId: uniq(plots.map(x => x.blockId)).join(', '),
    lotNo: uniq(plots.map(x => x.lotNo)).join(', '),
    typeName: uniq(plots.map(x => PRESALE_TYPE_LABEL[x.typeId] || x.typeId)).join(', '),
    contractPriceValue: a.totalPrice,
    yearText: a.plan === 'cash' ? 'Spot cash' : a.years ? `${a.years} year${a.years > 1 ? 's' : ''}` : '',
    createdAt: first ? first.date : a.createdAt,
    amountValue: first ? first.amount : null,
    payments: pays,
    agentName: a.agentName || '',
    agentCommission: a.agentId ? presaleCommission(a) : a.agentCommission || 0,
    brokerName: a.brokerName || '',
    phaseNo: a.phaseNo || ''
  };
}
// Edit screen: staff can correct anything on the sheet before the Word file is made.
function CustomerSheetEditor({ data, onClose, onToast }) {
  const ce = React.createElement;
  const toMs = v => v && v.toDate ? v.toDate().getTime() : typeof v === 'number' ? v : (typeof v === 'string' && /^\d+$/.test(v)) ? Number(v) : v ? new Date(v).getTime() : null;
  const ymd = v => {
    const ms = toMs(v);
    if (!ms || isNaN(ms)) return '';
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const fromYmd = t => { // a date typed as YYYY-MM-DD, read as a local date
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t || '');
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() : null;
  };
  const num = t => { const n = Number(String(t == null ? '' : t).replace(/[^0-9.]/g, '')); return n > 0 ? n : 0; };
  const [f, setF] = React.useState(() => ({
    fullName: data.fullName || '',
    phone: data.phone || '',
    blockId: data.blockId || '',
    lotNo: data.lotNo || '',
    typeName: data.typeName || '',
    phaseNo: data.phaseNo || '',
    contractPrice: data.contractPriceValue || '',
    yearText: data.yearText || '',
    date: ymd(data.createdAt),
    amount: data.amountValue || '',
    agentName: data.agentName || '',
    commissionDate: ymd(data.agentCommissionDate),
    agentCommission: data.agentCommission || '',
    brokerName: data.brokerName || ''
  }));
  const [rows, setRows] = React.useState(() => [...(data.payments || [])].sort((x, y) => (toMs(x.date) || 0) - (toMs(y.date) || 0)).map(p => ({
    date: ymd(p.date),
    ref: p.ref || p.receipt || '',
    amount: p.amount || '',
    note: p.note || ''
  })));
  const [busy, setBusy] = React.useState(false);
  const set = k => e => setF(x => ({ ...x, [k]: e.target.value }));
  const setRow = (i, k, v) => setRows(rs => rs.map((r, j) => j === i ? { ...r, [k]: v } : r));
  const inp = { width: '100%', boxSizing: 'border-box', padding: 6, fontSize: 13 };
  const field = (label, k, type) => ce('label', { style: { display: 'block', fontSize: 12, fontWeight: 600 } }, label, ce('input', { type: type || 'text', value: f[k], onChange: set(k), style: { ...inp, display: 'block', marginTop: 2, fontWeight: 400 } }));
  const make = async () => {
    setBusy(true);
    try {
      await downloadCustomerSheet({
        fullName: f.fullName,
        phone: f.phone,
        blockId: f.blockId,
        lotNo: f.lotNo,
        typeName: f.typeName,
        phaseNo: f.phaseNo,
        contractPriceValue: num(f.contractPrice),
        yearText: f.yearText,
        createdAt: fromYmd(f.date),
        amountValue: num(f.amount),
        agentName: f.agentName,
        agentCommissionDate: fromYmd(f.commissionDate),
        agentCommission: num(f.agentCommission),
        brokerName: f.brokerName,
        payments: rows.filter(r => r.date || r.ref || num(r.amount) || r.note).map(r => ({ date: fromYmd(r.date), ref: r.ref, amount: num(r.amount), note: r.note }))
      });
      onClose();
    } catch (e) {
      onToast && onToast(e && e.message || 'Could not make the sheet');
    } finally {
      setBusy(false);
    }
  };
  return ce('div', { className: 'modal-bg', style: { zIndex: 200 } },
    ce('div', { className: 'modal wide', style: { width: 820 } },
      ce('h3', null, 'Customer monitoring sheet — check and edit, then download'),
      ce('div', { className: 'modal-scroll' },
        ce('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 } },
          field('NAME', 'fullName'), field('CONTACT NO.', 'phone'),
          field('BLOCK', 'blockId'), field('LOT TYPE', 'typeName'),
          field('LOT NO.', 'lotNo'), field('PHASE NO.', 'phaseNo'),
          field('CONTRACT PRICE (₱)', 'contractPrice', 'number'), field('YEAR CONRACT', 'yearText'),
          field('DATE', 'date', 'date'), field('AMOUNT (₱)', 'amount', 'number')),
        ce('div', { style: { fontWeight: 700, fontSize: 13, margin: '16px 0 6px' } }, 'Payments (oldest first, up to 60)'),
        ce('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 12 } },
          ce('thead', null, ce('tr', null, ['DATE', 'RECEIPT NO.', 'AMOUNT (₱)', 'REMARKS (Cash, GCash, Bank transfer)', ''].map((h, i) => ce('th', { key: i, style: { textAlign: 'left', padding: '2px 4px' } }, h)))),
          ce('tbody', null, rows.map((r, i) => ce('tr', { key: i },
            ce('td', { style: { padding: 2 } }, ce('input', { type: 'date', value: r.date, onChange: e => setRow(i, 'date', e.target.value), style: inp })),
            ce('td', { style: { padding: 2 } }, ce('input', { value: r.ref, onChange: e => setRow(i, 'ref', e.target.value), style: inp })),
            ce('td', { style: { padding: 2 } }, ce('input', { type: 'number', value: r.amount, onChange: e => setRow(i, 'amount', e.target.value), style: inp })),
            ce('td', { style: { padding: 2 } }, ce('input', { value: r.note, onChange: e => setRow(i, 'note', e.target.value), style: inp })),
            ce('td', { style: { padding: 2 } }, ce('button', { type: 'button', className: 'btn btn-outline btn-sm', onClick: () => setRows(rs => rs.filter((_, j) => j !== i)) }, '✕')))))),
        rows.length < 60 && ce('button', { type: 'button', className: 'btn btn-outline btn-sm', style: { marginTop: 6 }, onClick: () => setRows(rs => [...rs, { date: ymd(Date.now()), ref: '', amount: '', note: '' }]) }, '+ Add payment row'),
        ce('div', { style: { fontWeight: 700, fontSize: 13, margin: '16px 0 6px' } }, 'Agent and broker'),
        ce('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 } },
          field('AGENT', 'agentName'), field('BROKER', 'brokerName'),
          field('Commission date', 'commissionDate', 'date'), field('Commission (₱)', 'agentCommission', 'number')),
        ce('div', { style: { fontSize: 11, color: '#777', marginTop: 10 } }, 'Changes here only affect this sheet. They are not saved to the customer record.')),
      ce('div', { className: 'modal-actions' },
        ce('button', { type: 'button', className: 'btn btn-outline', onClick: onClose }, 'Cancel'),
        ce('button', { type: 'button', className: 'btn btn-primary', disabled: busy, onClick: make }, busy ? 'Making…' : '⬇ Download Word sheet'))));
}
// "📝 Sheet" button for the Customers list: finds the customer's sale (by mobile number), then opens the edit screen.
function CustomerSheetButton({ customer, plot, label, onToast }) {
  const ce = React.createElement;
  const [queue, setQueue] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const open = async () => {
    setBusy(true);
    try {
      const key = String(customer.phone || '').replace(/\D/g, '').slice(-10);
      let sales = [];
      if (key.length >= 10) {
        const snap = await window.db.collection('presaleApplications').where('mobileKey', '==', key).get();
        sales = snap.docs.map(d => ({ _id: d.id, ...d.data() })).filter(x => x.status !== 'cancelled');
      }
      const base = customerSheetData({
        ...customer,
        blockId: customer.blockId || (plot && plot.blockId) || '',
        lotNo: customer.lotNo || (plot && plot.lotNo) || ''
      }, customer.payments || []);
      setQueue(sales.length ? sales.map(sale => ({ ...base, ...presaleSheetData(sale) })) : [base]);
    } catch (e) {
      onToast && onToast('Could not open the sheet: ' + (e && e.message || 'error'));
    } finally {
      setBusy(false);
    }
  };
  return ce(React.Fragment, null,
    ce('button', { className: 'btn btn-outline btn-sm', disabled: busy, title: 'Customer monitoring sheet: check and edit, then download as Word', onClick: open }, label || '📝 Sheet'),
    queue.length > 0 && ce(CustomerSheetEditor, { key: queue.length, data: queue[0], onClose: () => setQueue(q => q.slice(1)), onToast }));
}
// Fills the company's own Word form (customer-monitoring-sheet.docx) with one customer's data
// and downloads it. Only the empty cells are filled; the form itself is never changed.
async function downloadCustomerSheet(d) {
  if (!window.JSZip) throw new Error('The Word library did not load. Check the internet connection and refresh the page.');
  const res = await fetch('customer-monitoring-sheet.docx', { cache: 'no-cache' });
  if (!res.ok) throw new Error('Could not load the sheet template.');
  const zip = await window.JSZip.loadAsync(await res.arrayBuffer());
  const xml = await zip.file('word/document.xml').async('string');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const kids = (el, name) => Array.from(el.childNodes).filter(n => n.localName === name);
  const textOf = el => Array.from(el.getElementsByTagNameNS(W, 't')).map(t => t.textContent).join('');
  const tables = Array.from(doc.getElementsByTagNameNS(W, 'tbl'));
  const findTable = label => tables.find(t => textOf(t).includes(label));
  const rowsOf = t => kids(t, 'tr');
  const cellsOf = r => kids(r, 'tc');
  const setCell = (tc, text) => {
    if (!tc || text === undefined || text === null || text === '') return;
    const p = kids(tc, 'p')[0];
    if (!p) return;
    kids(p, 'r').forEach(r => p.removeChild(r));
    const pPr = kids(p, 'pPr')[0];
    if (pPr) kids(pPr, 'ind').forEach(n => pPr.removeChild(n)); // some cells have a negative indent that would push text out of the cell
    const mark = pPr ? kids(pPr, 'rPr')[0] : null;
    const r = doc.createElementNS(W, 'w:r');
    if (mark) r.appendChild(mark.cloneNode(true));
    const t = doc.createElementNS(W, 'w:t');
    t.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
    t.textContent = String(text);
    r.appendChild(t);
    p.appendChild(r);
  };
  const toDate = v => v && v.toDate ? v.toDate() : (typeof v === 'number' || (typeof v === 'string' && /^\d+$/.test(v))) ? new Date(Number(v)) : v ? new Date(v) : null;
  const dateText = v => { const x = toDate(v); return x && !isNaN(x) ? x.toLocaleDateString('en-PH', { year: 'numeric', month: '2-digit', day: '2-digit' }) : ''; };
  const money = n => n || n === 0 ? fmt2(n) : '';

  // Header block (NAME, BLOCK, LOT NO., CONTRACT PRICE, DATE) : value cells are 2nd and 5th
  const header = findTable('NAME:');
  const hv = [
    [d.fullName, d.phone],
    [d.blockId, d.typeName],
    [d.lotNo, d.phaseNo],
    [d.contractPriceValue ? money(d.contractPriceValue) : '', d.yearText],
    [dateText(d.createdAt), d.amountValue ? money(d.amountValue) : '']
  ];
  rowsOf(header).forEach((row, ri) => {
    const c = cellsOf(row);
    if (hv[ri]) { setCell(c[1], hv[ri][0]); setCell(c[4], hv[ri][1]); }
  });

  // Payment ledger: 3 groups of 20 rows, oldest payment first
  const ledger = findTable('RECEIPT NO.');
  const lrows = rowsOf(ledger);
  const pays = [...(d.payments || [])].sort((x, y) => (toDate(x.date) || 0) - (toDate(y.date) || 0));
  pays.slice(0, 60).forEach((p, i) => {
    const row = lrows[1 + (i % 20)];
    if (!row) return;
    const c = cellsOf(row);
    const b = Math.floor(i / 20) * 5;
    setCell(c[b], dateText(p.date));
    setCell(c[b + 1], p.ref || p.receipt || '');
    setCell(c[b + 2], money(p.amount));
    setCell(c[b + 3], p.note || '');
  });

  // Agent and broker block
  const agent = findTable('AGENT:');
  const arows = rowsOf(agent);
  setCell(cellsOf(arows[0])[1], d.agentName);
  setCell(cellsOf(arows[2])[0], dateText(d.agentCommissionDate));
  setCell(cellsOf(arows[2])[1], d.agentCommission ? money(d.agentCommission) : '');
  const broker = arows.find(r => textOf(r).includes('BROKER:'));
  if (broker) setCell(cellsOf(broker)[1], d.brokerName);

  const out = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + new XMLSerializer().serializeToString(doc).replace(/^<\?xml[^>]*\?>\s*/, '');
  zip.file('word/document.xml', out);
  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Customer Monitoring Sheet - ${(d.fullName || 'customer').replace(/[^\w .-]/g, '')}.docx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return blob;
}
// Same fields for a CRM customer who has no sale yet
function customerSheetData(customer, payments) {
  const plan = customer.plan || {};
  return {
    fullName: customer.fullName || [customer.firstName, customer.lastName].filter(Boolean).join(' '),
    phone: customer.phone,
    blockId: customer.blockId,
    lotNo: customer.lotNo,
    phaseNo: customer.phaseNo,
    typeName: plan.tierName || customer.typeName,
    contractPriceValue: plan.price,
    yearText: plan.termLabel,
    createdAt: customer.createdAt,
    amountValue: plan.monthlyAmount,
    payments: (payments || []).map(p => ({ date: p.date, ref: p.ref, amount: p.amount, note: p.method || p.note || '' })),
    agentName: customer.agentName,
    agentCommission: customer.agentCommission,
    brokerName: customer.brokerName
  };
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
    if (!confirm('This will reset prices/descriptions to the default 8 plot types. Photo URLs you\'ve already set will be kept. Continue?')) return;
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
  }, "No products in database yet.", /*#__PURE__*/React.createElement("br", null), "Click \"Seed default products\" to push your 8 standard plot types to Firestore.", /*#__PURE__*/React.createElement("br", null), "After seeding, price changes here will reflect live on your website.")) : /*#__PURE__*/React.createElement("div", {
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
// ── Presale applications (Blocks A, B, C, D) ──────────────────────────────────
// Buyers reserve through /api/presale, which writes presaleApplications/{ref}
// and plots/{block}_{lot}. Staff verify by phone, then confirm payment here.
const PRESALE_METHOD_LABEL = {
  paymongo: 'PayMongo (Online)',
  cash: 'Cash',
  gcash: 'GCash',
  bank: 'Bank transfer',
  cheque: 'Cheque'
};
const PRESALE_TYPE_LABEL = {
  'regular': 'Regular',
  'premium': 'Premium',
  'corner-premium': 'Corner Premium'
};
function presalePlots(a) {
  return Array.isArray(a.plots) && a.plots.length ? a.plots : [{
    blockId: a.blockId,
    lotNo: a.lotNo,
    plotCode: a.plotCode,
    typeId: a.typeId
  }];
}
function presalePlanText(a) {
  return a.plan === 'cash' ? 'Spot cash' : `${a.years} years · ${fmt(a.monthly)}/mo`;
}
// Payment ledger: every payment staff receive is added to a.payments. Extra money
// automatically covers the next months, so the months left go down on their own.
// VAT: prices are treated as VAT-INCLUSIVE. Change the rate here if it ever changes.
const PRESALE_VAT_RATE = 0.12;
function presaleVat(gross) {
  const g = Number(gross) || 0;
  const net = Math.round(g / (1 + PRESALE_VAT_RATE) * 100) / 100;
  return {
    gross: g,
    net,
    vat: Math.round((g - net) * 100) / 100
  };
}
function fmt2(n) {
  return '₱' + (Number(n) || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}
const PRESALE_SURCHARGE = {
  1: 0.10,
  2: 0.15,
  3: 0.20,
  5: 0.30
};
// Splits a reservation's total into the plot price and the installment surcharge.
function presaleSplit(a) {
  const total = a.totalPrice || 0;
  const rate = a.plan === 'installment' ? PRESALE_SURCHARGE[a.years] || 0 : 0;
  const base = rate ? Math.round(total / (1 + rate)) : total;
  return {
    total,
    base,
    surcharge: total - base,
    ratio: total ? (total - base) / total : 0
  };
}
// SOP: allocation of each payment into Agent Commission / Broker & Agent Compensation / Company.
// Only the FIRST payment (the down payment) is split. Later payments go fully to the company
// until management sets the installment commission policy. No agent on the sale = all company.
// The three rates below are the defaults; an admin can change them in the Allocation view
// (saved in presaleSettings/allocation). A payment recorded for a sale that has an agent keeps
// the split it was recorded with, so later rule changes do not rewrite past reports.
const SOP_RULES = {
  commissionRate: 0.07,   // 7% of the plot price (spot cash price) when no commission amount was typed
  agentFirstShare: 0.5,   // 50% of the commission is released from the down payment
  brokerRate: 0.03        // 3% of the down payment is held for broker and agent compensation
};
function presaleCommission(a) {
  if (!a.agentId) return 0;
  const base = a.spotPrice || presaleSplit(a).base;
  return a.agentCommission > 0 ? a.agentCommission : Math.round(base * SOP_RULES.commissionRate);
}
function presaleAllocOne(a, amount, index) {
  const amt = Number(amount) || 0;
  const c2 = n => Math.round(n * 100) / 100;
  if (!a.agentId || index > 0) return { agent: 0, broker: 0, company: amt };
  const agent = Math.min(Math.round(presaleCommission(a) * SOP_RULES.agentFirstShare), amt);
  const broker = Math.min(c2(amt * SOP_RULES.brokerRate), amt - agent);
  return { agent, broker, company: c2(amt - agent - broker) };
}
function presaleAlloc(a) {
  return presaleLedger(a).list.map((x, i) => x.alloc ? x.alloc : presaleAllocOne(a, x.amount, i));
}
function presaleMonthKey(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
function presaleMonthLabel(k) {
  const [y, m] = k.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString('en-PH', {
    month: 'long',
    year: 'numeric'
  });
}
function presaleLedger(a) {
  const total = a.totalPrice || 0;
  const monthly = a.plan === 'cash' ? total : a.monthly || 0;
  let list = Array.isArray(a.payments) ? a.payments : [];
  if (!list.length && a.status === 'paid') list = [{
    amount: a.plan === 'cash' ? total : monthly,
    date: a.paymentConfirmedAt,
    ref: a.paymentReference
  }];
  const paid = list.reduce((n, x) => n + (Number(x.amount) || 0), 0);
  const balance = Math.max(0, total - paid);
  const monthsPaid = monthly > 0 ? Math.min(a.years * 12 || 1, Math.floor((paid + 0.5) / monthly)) : 0;
  const monthsLeft = balance <= 0 ? 0 : monthly > 0 ? Math.ceil((balance - 0.5) / monthly) : 0;
  const first = list.length ? list[0].date : null;
  let nextDue = null;
  if (a.plan === 'installment' && first && balance > 0) {
    nextDue = new Date(first);
    nextDue.setMonth(nextDue.getMonth() + monthsPaid);
  }
  return {
    list, paid, balance, monthly, monthsPaid, monthsLeft, nextDue, full: total > 0 && balance <= 0
  };
}
// Rows of money received on one day (YYYY-MM-DD), with the SOP split of each payment.
function presalePaymentsOn(live, dk) {
  const key = ms => {
    if (!ms) return '';
    const d = new Date(ms);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  const out = [];
  live.forEach(r => {
    const A0 = presaleAlloc(r);
    presaleLedger(r).list.forEach((x, i) => {
      if (key(x.date) !== dk) return;
      const amt = Number(x.amount) || 0;
      const al = A0[i] || { agent: 0, broker: 0, company: amt };
      out.push({ date: x.date, receipt: x.ref || '', ref: r.ref, name: r.name, plots: presalePlots(r).map(p => p.plotCode).join(' '), agentName: r.agentName || '', brokerName: r.brokerName || '', method: PRESALE_METHOD_LABEL[x.method || r.method] || x.method || r.method || '', amount: amt, agent: al.agent, broker: al.broker, company: al.company, remarks: x.remarks || '' });
    });
  });
  return out;
}
const EOD_ACCOUNTS = { company: 'Company operating account', agent: 'Agent commission account', broker: 'Broker and agent compensation account' };
// Deposit instructions and the end-of-day report for one day (SOP sections 5, 6, 9).
function PresaleEod({ day, rows, actor, setToast }) {
  const [deposits, setDeposits] = useState([]);
  const [report, setReport] = useState(null);
  const [verif, setVerif] = useState('pending');
  const [disc, setDisc] = useState('');
  const [busy, setBusy] = useState(false);
  const nowTime = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  const blank = { ref: '', amount: '', type: 'cash', allocation: 'company', staff: actor, bank: '', account: '', depositDate: day, depositTime: nowTime() };
  const [f, setF] = useState(blank);
  useEffect(() => window.db.collection('presaleDeposits').where('day', '==', day).onSnapshot(s => setDeposits(s.docs.map(d => ({ _id: d.id, ...d.data() })).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))), () => {}), [day]);
  useEffect(() => window.db.collection('presaleEodReports').doc(day).onSnapshot(sn => {
    const d = sn.exists ? sn.data() : null;
    setReport(d);
    setVerif(d && d.verification || 'pending');
    setDisc(d && d.discrepancies || '');
  }, () => {}), [day]);
  const sum = (arr, k) => arr.reduce((n, x) => n + (Number(x[k]) || 0), 0);
  const T = { count: rows.length, received: sum(rows, 'amount'), agent: sum(rows, 'agent'), broker: sum(rows, 'broker'), company: sum(rows, 'company') };
  const depCash = deposits.filter(d => d.type === 'cash').reduce((n, d) => n + d.amount, 0);
  const depOnline = deposits.filter(d => d.type === 'online').reduce((n, d) => n + d.amount, 0);
  const depCompany = deposits.filter(d => d.allocation === 'company').reduce((n, d) => n + d.amount, 0);
  const gap = Math.round((T.company - depCompany) * 100) / 100;
  const dayLabel = new Date(day + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const field = (label, el) => plotEl("label", { key: label, style: { display: 'block', fontSize: 13, fontWeight: 600 } }, label, el);
  const inp = (k, props) => plotEl("input", { value: f[k], onChange: set(k), style: { display: 'block', width: '100%', boxSizing: 'border-box', padding: 8, marginTop: 3, fontWeight: 400 }, ...props });
  const sel = (k, opts) => plotEl("select", { value: f[k], onChange: set(k), style: { display: 'block', width: '100%', boxSizing: 'border-box', padding: 8, marginTop: 3, fontWeight: 400 } }, opts.map(([v, l]) => plotEl("option", { key: v, value: v }, l)));
  const saveDeposit = async () => {
    const amount = Math.round(Number(String(f.amount).replace(/[^0-9.]/g, '')) * 100) / 100;
    if (!(amount > 0)) { setToast('Please write the amount to be deposited.'); return; }
    if (!f.bank.trim() || !f.account.trim() || !f.staff.trim()) { setToast('Please fill in the bank name, account number and responsible staff.'); return; }
    setBusy(true);
    try {
      await window.db.collection('presaleDeposits').add({ day, ref: f.ref.trim() || `DEP-${day.replace(/-/g, '')}-${deposits.length + 1}`, amount, type: f.type, allocation: f.allocation, staff: f.staff.trim(), bank: f.bank.trim(), account: f.account.trim(), depositDate: f.depositDate || day, depositTime: f.depositTime || '', createdAt: Date.now(), createdBy: actor });
      setF({ ...blank, bank: f.bank, account: f.account, staff: f.staff });
      setToast('Deposit instruction saved');
    } catch (err) { setToast(err && err.message || 'Could not save'); } finally { setBusy(false); }
  };
  const delDeposit = async d => {
    if (!window.confirm(`Delete deposit ${d.ref}?`)) return;
    try { await window.db.collection('presaleDeposits').doc(d._id).delete(); } catch (err) { setToast(err && err.message || 'Could not delete'); }
  };
  const snapshot = () => ({ day, verification: verif, discrepancies: disc.trim(), transactions: T.count, received: T.received, agentTotal: T.agent, brokerAndCompensationTotal: T.broker, companyTotal: T.company, cashDeposits: depCash, onlineTransfers: depOnline, notYetDeposited: gap, updatedAt: Date.now(), updatedBy: actor });
  const saveReport = async extra => {
    setBusy(true);
    try { await window.db.collection('presaleEodReports').doc(day).set({ ...snapshot(), ...extra }, { merge: true }); setToast('End-of-day report saved'); }
    catch (err) { setToast(err && err.message || 'Could not save'); } finally { setBusy(false); }
  };
  const approve = () => {
    if (verif !== 'verified' && !window.confirm('Receipts are not marked as Verified. Approve anyway?')) return;
    if (Math.abs(gap) > 0.5 && !disc.trim() && !window.confirm(`The company share is not fully deposited (${fmt2(gap)} difference) and no discrepancy note was written. Approve anyway?`)) return;
    saveReport({ approvedBy: actor, approvedAt: Date.now() });
  };
  const reopen = () => { if (window.confirm('Re-open this report for changes?')) saveReport({ approvedBy: '', approvedAt: null }); };
  const approved = !!(report && report.approvedAt);
  const VER = { pending: 'Pending', verified: 'Verified', issues: 'Has problems' };
  const printEod = () => {
    const w = window.open('', '_blank');
    if (!w) { setToast('Please allow pop-ups to print.'); return; }
    const e = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const m = n => (Number(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const kv = (k, v, b) => '<tr><td>' + k + '</td><td class="n">' + (b ? '<b>' + v + '</b>' : v) + '</td></tr>';
    const depRows = deposits.map(d => '<tr><td>' + e(d.ref) + '</td><td>' + e(d.type === 'cash' ? 'Cash deposit' : 'Online transfer') + '</td><td>' + e(EOD_ACCOUNTS[d.allocation] || d.allocation) + '</td><td>' + e(d.bank) + ' / ' + e(d.account) + '</td><td>' + e(d.depositDate) + ' ' + e(d.depositTime) + '</td><td>' + e(d.staff) + '</td><td class="n">' + m(d.amount) + '</td></tr>').join('') || '<tr><td colspan="7">No deposits recorded.</td></tr>';
    w.document.write('<html><head><title>End-of-Day Report</title><style>body{font-family:Arial,sans-serif;padding:24px;font-size:13px}table{border-collapse:collapse;width:100%;margin-bottom:14px}th,td{border:1px solid #999;padding:5px 7px;text-align:left}td.n,th.n{text-align:right}h2{margin:0 0 2px}h3{margin:14px 0 6px}</style></head><body><h2>Golden Harmonic Memorial Park</h2><div><b>End-of-Day Report</b> - ' + e(dayLabel) + '</div><h3>Totals</h3><table>' + kv('Total transactions', T.count) + kv('Total amount received', m(T.received), 1) + kv('Agent commission allocation total', m(T.agent)) + kv('Broker fee and agent compensation allocation total (3%)', m(T.broker)) + kv('Company deposit total', m(T.company), 1) + '</table><h3>Deposits made</h3><table><tr><th>Reference</th><th>Type</th><th>Account allocation</th><th>Bank / account no.</th><th>Deposit date and time</th><th>Responsible staff</th><th class="n">Amount</th></tr>' + depRows + '</table><table>' + kv('Cash deposits made', m(depCash)) + kv('Online transfers made', m(depOnline)) + kv('Company share not yet deposited', m(gap), 1) + '</table><table>' + kv('Receipt verification status', e(VER[verif] || verif)) + kv('Discrepancies', e(disc || 'None')) + kv('Final approval', approved ? e(report.approvedBy) + ' - ' + new Date(report.approvedAt).toLocaleString('en-PH') : 'Not yet approved') + '</table><p>Prepared by: ____________________ &nbsp;&nbsp; Approved by: ____________________</p></body></html>');
    w.document.close();
    w.focus();
    w.print();
  };
  const card = (title, ...kids) => plotEl("div", { style: { padding: 12, borderRadius: 8, background: '#f6f1e8', marginBottom: 12 } }, plotEl("b", null, title), ...kids);
  const line = (k, v, bold) => plotEl("div", { key: k, style: { display: 'flex', justifyContent: 'space-between', gap: 12, padding: '3px 0', fontWeight: bold ? 700 : 400 } }, plotEl("span", null, k), plotEl("span", null, v));
  return plotEl("div", null, plotEl("div", { style: { fontWeight: 700, marginBottom: 8 } }, dayLabel), card('End-of-day report (filled in automatically from the payments recorded)', plotEl("div", { style: { marginTop: 6 } }, line('Total transactions', T.count), line('Total amount received', fmt2(T.received), true), line('Agent commission allocation total', fmt2(T.agent)), line('Broker fee and agent compensation allocation total (3%)', fmt2(T.broker)), line('Company deposit total', fmt2(T.company), true), line('Cash deposits made', fmt2(depCash)), line('Online transfers made', fmt2(depOnline)), line('Company share not yet deposited', fmt2(gap), true))), card('Deposit instruction', plotEl("div", { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10, marginTop: 8 } }, field('Transaction reference', inp('ref', { placeholder: `DEP-${day.replace(/-/g, '')}-${deposits.length + 1}` })), field('Amount to be deposited (₱)', inp('amount', { inputMode: 'decimal', placeholder: gap > 0 ? String(gap) : '' })), field('Payment type', sel('type', [['cash', 'Cash deposit'], ['online', 'Online transfer']])), field('Account allocation', sel('allocation', Object.entries(EOD_ACCOUNTS))), field('Responsible staff', inp('staff')), field('Bank name', inp('bank')), field('Account number', inp('account')), field('Deposit date', inp('depositDate', { type: 'date' })), field('Deposit time', inp('depositTime', { type: 'time' }))), plotEl("button", { className: "btn btn-primary btn-sm", style: { marginTop: 10 }, disabled: busy, onClick: saveDeposit }, "Save deposit instruction"), deposits.length > 0 && plotEl("table", { className: "gh-table gh-table-dense", style: { marginTop: 10 } }, plotEl("thead", null, plotEl("tr", null, ['Reference', 'Type', 'Allocation', 'Bank / account', 'Date and time', 'Staff', 'Amount', ''].map(h => plotEl("th", { key: h }, h)))), plotEl("tbody", null, deposits.map(d => plotEl("tr", { key: d._id }, plotEl("td", null, d.ref), plotEl("td", null, d.type === 'cash' ? 'Cash' : 'Online'), plotEl("td", null, EOD_ACCOUNTS[d.allocation] || d.allocation), plotEl("td", null, d.bank, ' / ', d.account), plotEl("td", null, d.depositDate, ' ', d.depositTime), plotEl("td", null, d.staff), plotEl("td", { style: { textAlign: 'right' } }, fmt2(d.amount)), plotEl("td", null, plotEl("button", { className: "btn btn-outline btn-sm", onClick: () => delDeposit(d) }, "Delete"))))))), card('Verification and approval', plotEl("div", { style: { marginTop: 8 } }, plotEl("label", { style: { display: 'block', fontSize: 13, fontWeight: 600 } }, 'Receipt verification status', plotEl("select", { value: verif, disabled: approved, onChange: e => setVerif(e.target.value), style: { display: 'block', padding: 8, marginTop: 3, fontWeight: 400 } }, Object.entries(VER).map(([v, l]) => plotEl("option", { key: v, value: v }, l)))), plotEl("label", { style: { display: 'block', fontSize: 13, fontWeight: 600, marginTop: 8 } }, 'Discrepancies (write "None" if all matches)', plotEl("textarea", { value: disc, disabled: approved, onChange: e => setDisc(e.target.value), rows: 3, style: { display: 'block', width: '100%', boxSizing: 'border-box', padding: 8, marginTop: 3, fontWeight: 400 } })), approved ? plotEl("div", { style: { marginTop: 8 } }, plotEl("b", null, "✔ Approved by "), report.approvedBy, " · ", new Date(report.approvedAt).toLocaleString('en-PH')) : null, plotEl("div", { style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 } }, !approved && plotEl("button", { className: "btn btn-outline btn-sm", disabled: busy, onClick: () => saveReport({}) }, "Save report"), !approved && plotEl("button", { className: "btn btn-primary btn-sm", disabled: busy, onClick: approve }, "Final approval"), approved && plotEl("button", { className: "btn btn-outline btn-sm", disabled: busy, onClick: reopen }, "Re-open"), plotEl("button", { className: "btn btn-outline btn-sm", onClick: printEod }, "🖨 Print end-of-day report")))));
}

// Admin-only editor for the allocation rates (stored in presaleSettings/allocation).
function PresaleRules({ canEdit, tick, setToast, actor }) {
  const pct = n => String(Math.round(n * 10000) / 100);
  const [f, setF] = useState({ commissionRate: pct(SOP_RULES.commissionRate), agentFirstShare: pct(SOP_RULES.agentFirstShare), brokerRate: pct(SOP_RULES.brokerRate) });
  const [open, setOpen] = useState(false);
  useEffect(() => setF({ commissionRate: pct(SOP_RULES.commissionRate), agentFirstShare: pct(SOP_RULES.agentFirstShare), brokerRate: pct(SOP_RULES.brokerRate) }), [tick]);
  const save = async () => {
    const v = {};
    for (const k of Object.keys(f)) {
      const n = Number(f[k]);
      if (!(n >= 0 && n <= 100)) { setToast('Each rate must be between 0 and 100.'); return; }
      v[k] = Math.round(n * 100) / 10000;
    }
    try {
      await window.db.collection('presaleSettings').doc('allocation').set({ ...v, updatedAt: Date.now(), updatedBy: actor });
      setToast('Allocation rules saved. They apply to payments recorded from now on.');
      setOpen(false);
    } catch (err) { setToast(err && err.message || 'Could not save'); }
  };
  const labels = [['commissionRate', 'Agent commission (% of plot price)'], ['agentFirstShare', 'Share of commission released from the down payment (%)'], ['brokerRate', 'Broker and agent compensation (% of the down payment)']];
  return plotEl("div", { style: { padding: 10, borderRadius: 8, background: '#f1f8ec', marginBottom: 12, fontSize: 13, lineHeight: 1.6 } }, plotEl("b", null, "Allocation rules: "), `agent commission ${pct(SOP_RULES.commissionRate)}% of the plot price, ${pct(SOP_RULES.agentFirstShare)}% of it released from the down payment, ${pct(SOP_RULES.brokerRate)}% of the down payment held for broker and agent compensation, the rest to the company. `, canEdit ? plotEl("button", { className: "btn btn-outline btn-sm", onClick: () => setOpen(!open) }, open ? "Close" : "Change rules") : plotEl("em", null, "(only an admin can change these)"), open && canEdit && plotEl("div", { style: { marginTop: 8 } }, labels.map(([k, l]) => plotEl("label", { key: k, style: { display: 'block', marginBottom: 6 } }, l, plotEl("input", { value: f[k], inputMode: "decimal", onChange: e => setF({ ...f, [k]: e.target.value }), style: { display: 'block', padding: 6, width: 120 } }))), plotEl("button", { className: "btn btn-primary btn-sm", onClick: save }, "Save rules")));
}

function PresaleApplications({
  currentUser,
  canEditRules
}) {
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState(null);
  const [refText, setRefText] = useState('');
  const [amtText, setAmtText] = useState('');
  const [agentList, setAgentList] = useState([]);
  const [agentPick, setAgentPick] = useState('');
  const [commText, setCommText] = useState('');
  const [brokerText, setBrokerText] = useState('');
  const [allocDay, setAllocDay] = useState('');
  const todayKey = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  const [reportDay, setReportDay] = useState(todayKey());
  const [remarksText, setRemarksText] = useState('');
  const [ruleTick, setRuleTick] = useState(0);
  const [fAgent, setFAgent] = useState('');
  const [fBroker, setFBroker] = useState('');
  const [fPlot, setFPlot] = useState('');
  const [lastPay, setLastPay] = useState(null);
  const [sheetData, setSheetData] = useState(null);
  const [autoSheet, setAutoSheet] = useState(() => {
    try {
      return localStorage.getItem('ghAutoSheet') !== '0';
    } catch (e) {
      return true;
    }
  });
  const [emailAR, setEmailAR] = useState(() => {
    try {
      return localStorage.getItem('ghEmailAR') !== '0';
    } catch (e) {
      return true;
    }
  });
  const toggleEmailAR = on => {
    setEmailAR(on);
    try {
      localStorage.setItem('ghEmailAR', on ? '1' : '0');
    } catch (e) {}
  };
  // Emails the buyer an Acknowledgement Receipt for payment number `index` (the server checks that we are staff).
  const sendAR = async (ref, index) => {
    try {
      const user = window.auth && window.auth.currentUser;
      if (!user) throw new Error('Please log in again.');
      const idToken = await user.getIdToken();
      const r = await fetch('/api/send-ar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          idToken,
          ref,
          index
        })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not send the email.');
      setToast('Acknowledgement receipt emailed to ' + j.to);
    } catch (err) {
      setToast('Payment saved, but the email was not sent: ' + (err && err.message || 'error'));
    }
  };
  const toggleAutoSheet = on => {
    setAutoSheet(on);
    try {
      localStorage.setItem('ghAutoSheet', on ? '1' : '0');
    } catch (e) {}
  };
  useEffect(() => window.db.collection('presaleSettings').doc('allocation').onSnapshot(sn => {
    if (!sn.exists) return;
    const d = sn.data();
    ['commissionRate', 'agentFirstShare', 'brokerRate'].forEach(k => {
      if (typeof d[k] === 'number') SOP_RULES[k] = d[k];
    });
    setRuleTick(t => t + 1);
  }, () => {}), []);
  useEffect(() => window.db.collection('agents').onSnapshot(s => setAgentList(s.docs.map(d => ({
    _id: d.id,
    ...d.data()
  }))), () => {}), []);
  const [salesView, setSalesView] = useState('summary'); // summary | sales | vat
  const [period, setPeriod] = useState('all'); // 'all' or 'YYYY-MM' for the Sales and VAT box
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  useEffect(() => window.db.collection('presaleApplications').orderBy('createdAt', 'desc').onSnapshot(snap => setRows(snap.docs.map(d => ({
    _id: d.id,
    ...d.data()
  })))), []);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(''), 2400);
      return () => clearTimeout(t);
    }
  }, [toast]);
  if (!rows) return plotEl("div", {
    className: "loading"
  }, plotEl("div", {
    className: "spinner"
  }), plotEl("div", null, "Loading presale applications…"));
  const sel = open ? rows.find(r => r._id === open) : null;
  const actor = currentUser && currentUser.email || 'staff';
  const update = async (a, patch, msg) => {
    setBusy(true);
    try {
      await window.db.collection('presaleApplications').doc(a._id).update(patch);
      setToast(msg);
    } catch (err) {
      setToast(err && err.message || 'Could not save');
    } finally {
      setBusy(false);
    }
  };
  const confirmPaid = async a => {
    const amount = Math.round(Number(String(amtText).replace(/[^0-9.]/g, '')));
    if (!(amount > 0)) {
      setToast('Please write the amount received.');
      return;
    }
    if (!refText.trim()) {
      setToast('Please write the receipt, cheque or GCash reference first.');
      return;
    }
    const L = presaleLedger(a);
    // A custom amount can never be less than the chosen monthly installment.
    // (Only the last, smaller balance may be paid as it is.)
    const minPay = Math.min(L.monthly, L.balance);
    if (amount < minPay - 0.5) {
      setToast(`The amount cannot be less than ${fmt(minPay)}${a.plan === 'cash' ? '' : ' (the monthly installment)'}.`);
      return;
    }
    if (amount > L.balance + 0.5) {
      if (!window.confirm(`${fmt(amount)} is more than the balance of ${fmt(L.balance)}. Record it anyway?`)) return;
    }
    setBusy(true);
    try {
      const payIndex = (a.payments || []).length;
      const now = Date.now();
      const entry = {
        amount,
        date: now,
        ref: refText.trim(),
        method: a.method,
        remarks: remarksText.trim(),
        by: actor
      };
      const split = presaleAllocOne(a, amount, L.list.length);
      if (a.agentId) entry.alloc = {
        ...split,
        rates: {
          ...SOP_RULES
        }
      };
      const patch = {
        payments: firebase.firestore.FieldValue.arrayUnion(entry),
        status: 'paid',
        paymentReference: refText.trim(),
        paymentConfirmedAt: a.paymentConfirmedAt || now,
        confirmedBy: actor
      };
      await window.db.collection('presaleApplications').doc(a._id).update(patch);
      await Promise.all(presalePlots(a).map(x => window.db.collection('plots').doc(`${x.blockId}_${x.lotNo}`).update({
        hold: false
      }).catch(() => {})));
      setRefText('');
      setAmtText('');
      setRemarksText('');
      setLastPay({
        ref: a.ref,
        receipt: entry.ref,
        name: a.name,
        plots: presalePlots(a).map(p => p.plotCode).join(' '),
        amount,
        when: now,
        method: PRESALE_METHOD_LABEL[a.method] || a.method,
        index: payIndex,
        email: a.email || '',
        total: a.totalPrice || 0,
        paidSoFar: L.paid + amount,
        balance: Math.max(0, (a.totalPrice || 0) - L.paid - amount),
        ...split
      });
      setToast('Payment recorded');
      if (emailAR && a.email) sendAR(a.ref, payIndex);
      if (autoSheet) {
        // Opens the sheet for review, built from the sale as it is now, including the payment just recorded.
        setSheetData(presaleSheetData({
          ...a,
          payments: [...(a.payments || []), entry]
        }));
      }
    } catch (err) {
      setToast(err && err.message || 'Could not save');
    } finally {
      setBusy(false);
    }
  };
  const attachAgent = async a => {
    const agent = agentList.find(x => x._id === agentPick);
    const comm = Math.round(Number(String(commText).replace(/[^0-9.]/g, '')) || 0);
    if (!agent) {
      setToast('Please choose the agent.');
      return;
    }
    if (!(comm > 0)) {
      setToast('Please write the commission amount.');
      return;
    }
    setBusy(true);
    try {
      const saleMs = a.createdAt || Date.now();
      const dates = agentDates(saleMs);
      const ref = await window.db.collection('agentCommissions').add({
        agentId: agent._id,
        agentName: agent.name,
        agentEmail: agent.email || '',
        buyer: a.name,
        ref: `${a.ref} · ${presalePlots(a).map(x => x.plotCode).join(' ')}`,
        saleAmount: a.totalPrice || 0,
        commission: comm,
        saleDate: saleMs,
        ...dates,
        status: 'pending',
        notifiedAt: null,
        appRef: a.ref,
        createdAt: Date.now(),
        createdBy: actor
      });
      await window.db.collection('presaleApplications').doc(a._id).update({
        agentId: agent._id,
        agentName: agent.name,
        agentCommission: comm,
        agentCommissionId: ref.id
      });
      setAgentPick('');
      setCommText('');
      setToast('Agent and commission saved');
    } catch (err) {
      setToast(err && err.message || 'Could not save');
    } finally {
      setBusy(false);
    }
  };
  const cancelApp = async a => {
    if (!window.confirm(`Cancel ${a.ref} and free ${presalePlots(a).length > 1 ? 'all ' + presalePlots(a).length + ' plots' : 'plot ' + a.plotCode}? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await window.db.collection('presaleApplications').doc(a._id).update({
        status: 'cancelled',
        cancelledAt: Date.now(),
        cancelledBy: actor
      });
      await Promise.all(presalePlots(a).map(x => window.db.collection('plots').doc(`${x.blockId}_${x.lotNo}`).delete()));
      setToast(presalePlots(a).length > 1 ? 'The plots are free again' : `${a.plotCode} is free again`);
      setOpen(null);
    } catch (err) {
      setToast(err && err.message || 'Could not cancel');
    } finally {
      setBusy(false);
    }
  };
  const live = rows.filter(r => r.status !== 'cancelled');
  const stat = (n, label) => plotEl("div", {
    className: "stat-card"
  }, plotEl("div", null, plotEl("div", {
    className: "stat-num"
  }, n), plotEl("div", {
    className: "stat-lbl"
  }, label)));
  const allPaid = live.reduce((n, r) => n + presaleLedger(r).paid, 0);
  const allVat = presaleVat(allPaid);
  const shown = rows.filter(r => filter === 'all' ? true : filter === 'cash' ? r.plan === 'cash' && r.status !== 'cancelled' : filter === 'installment' ? r.plan === 'installment' && r.status !== 'cancelled' : r.status === filter);
  const statusBadge = (s, r) => plotEl("span", {
    className: s === 'paid' ? 'badge badge-converted' : s === 'cancelled' ? 'badge' : s === 'verified' ? 'badge badge-contacted' : 'badge badge-new'
  }, s === 'new' ? 'New' : s === 'verified' ? 'Verified' : s === 'paid' ? r && r.plan === 'installment' && !presaleLedger(r).full ? `Paying · ${presaleLedger(r).monthsLeft} mo left` : 'Paid in full' : 'Cancelled');
  return plotEl("div", null, toast && plotEl(Toast, {
    msg: toast,
    onDone: () => setToast('')
  }), plotEl("div", {
    className: "section-hd"
  }, plotEl("h2", null, "Presale applications")), plotEl("div", {
    className: "stats-row",
    style: {
      gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))',
      marginBottom: 16
    }
  }, stat(live.length, 'Reserved plots'), stat(live.filter(r => r.plan === 'cash').length, 'Spot cash'), stat(live.filter(r => r.plan === 'installment').length, 'Monthly'), stat(live.filter(r => r.status === 'paid').length, 'Payment confirmed'), stat(fmt2(allVat.net), 'Sales (without tax)'), stat(fmt2(allVat.vat), 'Tax (VAT 12%) collected')), (() => {
    // Booked sales are counted in the month the reservation was made; collections in the month each payment was received.
    const monthSet = new Set();
    rows.forEach(r => {
      monthSet.add(presaleMonthKey(r.createdAt));
      presaleLedger(r).list.forEach(x => monthSet.add(presaleMonthKey(x.date)));
    });
    monthSet.delete('');
    const months = [...monthSet].sort().reverse();
    const inPeriod = ms => period === 'all' || presaleMonthKey(ms) === period;
    const bookedRows = live.filter(r => inPeriod(r.createdAt));
    const booked = {
      base: 0,
      surcharge: 0
    };
    bookedRows.forEach(r => {
      const sp = presaleSplit(r);
      booked.base += sp.base;
      booked.surcharge += sp.surcharge;
    });
    const coll = {
      base: 0,
      surcharge: 0
    };
    const payRows = [];
    live.forEach(r => {
      const sp = presaleSplit(r);
      const allList = presaleLedger(r).list;
      const allAlloc = presaleAlloc(r);
      allList.filter(x => inPeriod(x.date)).forEach(x => {
        const al = allAlloc[allList.indexOf(x)] || { agent: 0, broker: 0, company: Number(x.amount) || 0 };
        const amt = Number(x.amount) || 0;
        coll.surcharge += amt * sp.ratio;
        coll.base += amt * (1 - sp.ratio);
        const v = presaleVat(amt);
        payRows.push({
          date: x.date,
          ref: r.ref,
          name: r.name,
          receipt: x.ref || '',
          amount: amt,
          net: v.net,
          vat: v.vat,
          agentName: r.agentName || '',
          brokerName: r.brokerName || '',
          agent: al.agent,
          broker: al.broker,
          company: al.company,
          time: x.date ? new Date(x.date).toLocaleTimeString('en-PH', {
            hour: '2-digit',
            minute: '2-digit'
          }) : '',
          plots: presalePlots(r).map(p => p.plotCode).join(' '),
          method: PRESALE_METHOD_LABEL[x.method || r.method] || x.method || r.method || '',
          remarks: x.remarks || ''
        });
      });
    });
    payRows.sort((p, q) => (p.date || 0) - (q.date || 0));
    const saleRows = bookedRows.slice().sort((p, q) => (p.createdAt || 0) - (q.createdAt || 0)).map(r => {
      const sp = presaleSplit(r);
      const v = presaleVat(sp.total);
      return {
        date: r.createdAt,
        ref: r.ref,
        name: r.name,
        plots: presalePlots(r).map(x => x.plotCode).join(' '),
        base: sp.base,
        surcharge: sp.surcharge,
        total: sp.total,
        net: v.net,
        vat: v.vat
      };
    });
    const line = (label, v) => {
      const total = v.base + v.surcharge;
      const t = presaleVat(total);
      return {
        label,
        base: v.base,
        surcharge: v.surcharge,
        vat: t.vat,
        net: t.net,
        total
      };
    };
    const out = [line(`Booked sales (${bookedRows.length} reservations)`, booked), line('Collected (payments received)', coll)];
    const R = {
      textAlign: 'right'
    };
    const sum = (arr, k) => arr.reduce((n, x) => n + (x[k] || 0), 0);
    const day = ms => ms ? new Date(ms).toLocaleDateString('en-PH') : '';
    const periodName = period === 'all' ? 'all-time' : period;
    const download = (name, header, lines) => {
      const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
      const csv = [header, ...lines].map(l => l.map(esc).join(',')).join('\r\n');
      const url = URL.createObjectURL(new Blob(['﻿' + csv], {
        type: 'text/csv;charset=utf-8'
      }));
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    const taxMonths = {};
    payRows.forEach(x => {
      const k = presaleMonthKey(x.date);
      if (!taxMonths[k]) taxMonths[k] = { month: k, amount: 0, net: 0, vat: 0 };
      taxMonths[k].amount += x.amount;
      taxMonths[k].net += x.net;
      taxMonths[k].vat += x.vat;
    });
    const taxRows = Object.values(taxMonths).sort((p, q) => p.month < q.month ? -1 : 1);
    const taxCollected = sum(payRows, 'vat');
    const taxBooked = sum(saleRows, 'vat');
    const taxCard = (label, v, note, color) => plotEl("div", {
      key: label,
      style: {
        flex: '1 1 200px',
        padding: 14,
        borderRadius: 10,
        background: color
      }
    }, plotEl("div", {
      style: {
        fontSize: 13,
        color: '#444'
      }
    }, label), plotEl("div", {
      style: {
        fontSize: 26,
        fontWeight: 800
      }
    }, fmt2(v)), plotEl("div", {
      style: {
        fontSize: 12,
        color: '#666',
        marginTop: 2
      }
    }, note));
    const printDaily = () => {
      const dk = ms => {
        if (!ms) return '';
        const d = new Date(ms);
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      };
      const day0 = reportDay || todayKey();
      const newRes = live.filter(r => dk(r.createdAt) === day0);
      const pays = [];
      live.forEach(r => {
        const L0 = presaleLedger(r);
        const A0 = presaleAlloc(r);
        L0.list.forEach((x, i) => {
          if (dk(x.date) !== day0) return;
          const amt = Number(x.amount) || 0;
          const v = presaleVat(amt);
          const al = A0[i] || { agent: 0, broker: 0, company: amt };
          pays.push({ ref: r.ref, name: r.name, receipt: x.ref || '', method: PRESALE_METHOD_LABEL[r.method] || r.method || '', amount: amt, net: v.net, vat: v.vat, agent: al.agent, broker: al.broker, company: al.company });
        });
      });
      const w = window.open('', '_blank');
      if (!w) { setToast('Please allow pop-ups to print.'); return; }
      const e = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;');
      const m = n => (Number(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const tot = k => pays.reduce((n, x) => n + x[k], 0);
      const dayLabel = new Date(day0 + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      const resRows = newRes.map(r => '<tr><td>' + e(r.ref) + '</td><td>' + e(r.name) + '</td><td>' + e(presalePlots(r).map(x => x.plotCode).join(' ')) + '</td><td>' + (r.plan === 'cash' ? 'Spot cash' : r.years + '-year monthly') + '</td><td class="n">' + m(r.totalPrice) + '</td></tr>').join('') || '<tr><td colspan="5">No new reservations.</td></tr>';
      const payRowsHtml = pays.map(x => '<tr><td>' + e(x.ref) + '</td><td>' + e(x.name) + '</td><td>' + e(x.method) + ' ' + e(x.receipt) + '</td><td class="n">' + m(x.amount) + '</td><td class="n">' + m(x.net) + '</td><td class="n">' + m(x.vat) + '</td></tr>').join('') || '<tr><td colspan="6">No payments received.</td></tr>';
      w.document.write('<html><head><title>Daily Sales Report</title><style>body{font-family:Arial,sans-serif;padding:24px;font-size:13px}table{border-collapse:collapse;width:100%;margin-bottom:16px}th,td{border:1px solid #999;padding:5px 7px;text-align:left}td.n,th.n{text-align:right}h2{margin:0 0 2px}h3{margin:14px 0 6px}.box td{font-size:14px}</style></head><body><h2>Golden Harmonic Memorial Park</h2><div><b>Daily Sales Report</b> - ' + e(dayLabel) + '</div><h3>New reservations (' + newRes.length + ')</h3><table><tr><th>Ref</th><th>Buyer</th><th>Plots</th><th>Plan</th><th class="n">Total price</th></tr>' + resRows + '</table><h3>Payments received (' + pays.length + ')</h3><table><tr><th>Ref</th><th>Buyer</th><th>Paid by / receipt</th><th class="n">Amount received</th><th class="n">Sales (no tax)</th><th class="n">Tax (VAT ' + Math.round(PRESALE_VAT_RATE * 100) + '%)</th></tr>' + payRowsHtml + '<tr><th colspan="3">Total</th><th class="n">' + m(tot('amount')) + '</th><th class="n">' + m(tot('net')) + '</th><th class="n">' + m(tot('vat')) + '</th></tr></table><h3>Where the money goes</h3><table class="box"><tr><td>Agent commission</td><td class="n">' + m(tot('agent')) + '</td></tr><tr><td>Broker and agent compensation (held)</td><td class="n">' + m(tot('broker')) + '</td></tr><tr><th>Company deposit</th><th class="n">' + m(tot('company')) + '</th></tr></table><p>Prepared by: ____________________ &nbsp;&nbsp; Verified by: ____________________</p></body></html>');
      w.document.close();
      w.focus();
      w.print();
    };
    const dayKey = ms => {
      if (!ms) return '';
      const d = new Date(ms);
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    };
    const match = (v, q) => !q.trim() || String(v || '').toLowerCase().includes(q.trim().toLowerCase());
    const allocRows = (allocDay ? payRows.filter(x => dayKey(x.date) === allocDay) : payRows).filter(x => match(x.agentName, fAgent) && match(x.brokerName, fBroker) && match(x.plots, fPlot));
    const fApps = live.filter(r => match(r.agentName, fAgent) && match(r.brokerName, fBroker) && match(presalePlots(r).map(p => p.plotCode).join(' '), fPlot));
    const allocCols = [['Date', 'date'], ['Time', 'time'], ['Transaction reference', 'receipt'], ['Buyer', 'name'], ['Plot / unit', 'plots'], ['Agent', 'agentName'], ['Broker', 'brokerName'], ['Payment type', 'method'], ['Amount received', 'amount', 1], ['Agent commission', 'agent', 1], ['Broker fee & agent compensation', 'broker', 1], ['Company share', 'company', 1], ['Remarks', 'remarks']];
    const allocHead = allocCols.map(c => c[0]);
    const allocLine = x => allocCols.map(c => c[1] === 'date' ? day(x.date) : x[c[1]]);
    const printAlloc = () => {
      const w = window.open('', '_blank');
      if (!w) { setToast('Please allow pop-ups to print.'); return; }
      const e = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;');
      const m = n => (Number(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const title = 'Payment Allocation Report - ' + (allocDay ? new Date(allocDay + 'T00:00:00').toLocaleDateString('en-PH') : period === 'all' ? 'All payments' : presaleMonthLabel(period));
      w.document.write('<html><head><title>' + e(title) + '</title><style>body{font-family:Arial,sans-serif;padding:24px;font-size:12px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:4px 6px;text-align:left}td.n,th.n{text-align:right}h2{margin:0 0 4px}</style></head><body><h2>Golden Harmonic Memorial Park</h2><div>' + e(title) + '</div><br><table><tr>' + allocCols.map(c => '<th class="' + (c[2] ? 'n' : '') + '">' + e(c[0]) + '</th>').join('') + '</tr>' + allocRows.map(x => '<tr>' + allocCols.map(c => c[2] ? '<td class="n">' + m(x[c[1]]) + '</td>' : '<td>' + e(c[1] === 'date' ? day(x.date) : x[c[1]]) + '</td>').join('') + '</tr>').join('') + '<tr><th colspan="8">Total</th><th class="n">' + m(sum(allocRows, 'amount')) + '</th><th class="n">' + m(sum(allocRows, 'agent')) + '</th><th class="n">' + m(sum(allocRows, 'broker')) + '</th><th class="n">' + m(sum(allocRows, 'company')) + '</th><th></th></tr></table><p><b>Deposit to company bank account: PHP ' + m(sum(allocRows, 'company')) + '</b></p><p>Prepared by: ____________________ &nbsp;&nbsp; Verified by: ____________________</p></body></html>');
      w.document.close();
      w.focus();
      w.print();
    };
    const exportCsv = () => {
      if (salesView === 'alloc') {
        download(`presale-allocation-${allocDay || periodName}.csv`, allocHead, allocRows.map(allocLine));
      } else if (salesView === 'vat') {
        download(`presale-tax-vat-${periodName}.csv`, ['Date', 'Ref', 'Buyer', 'Receipt/Reference', 'Amount received', 'Sales without VAT', 'VAT'], payRows.map(x => [day(x.date), x.ref, x.name, x.receipt, x.amount.toFixed(2), x.net.toFixed(2), x.vat.toFixed(2)]));
      } else {
        download(`presale-sales-${periodName}.csv`, ['Date', 'Ref', 'Buyer', 'Plots', 'Plot price', 'Installment surcharge', 'Total with VAT', 'Sales without VAT', 'VAT'], saleRows.map(x => [day(x.date), x.ref, x.name, x.plots, x.base.toFixed(2), x.surcharge.toFixed(2), x.total.toFixed(2), x.net.toFixed(2), x.vat.toFixed(2)]));
      }
    };
    const th = (h, r) => plotEl("th", {
      key: h || 'x',
      style: r ? R : null
    }, h);
    const td = (v, bold) => plotEl("td", {
      style: {
        ...R,
        fontWeight: bold ? 700 : 400
      }
    }, fmt2(v));
    let tbl;
    const taxHead = plotEl("div", null, plotEl("div", {
        style: {
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 12
        }
      }, taxCard('Total tax collected (VAT)', taxCollected, `on ${fmt2(sum(payRows, 'amount'))} received`, '#fff3c9'), taxCard('Tax on all booked sales', taxBooked, `on ${fmt2(sum(saleRows, 'total'))} sold`, '#eef3fb'), taxCard('Tax still to come in', Math.max(0, taxBooked - taxCollected), 'booked sales not yet paid', '#f1f8ec')), plotEl("table", { className: "gh-table" }, plotEl("thead", null, plotEl("tr", null, [['Month', false], ['Amount received', true], ['Sales without VAT', true], ['Tax (VAT)', true]].map(([h, rr]) => th(h, rr)))), plotEl("tbody", null, taxRows.map(x => plotEl("tr", {
        key: x.month
      }, plotEl("td", null, presaleMonthLabel(x.month)), td(x.amount), td(x.net), td(x.vat, true))), plotEl("tr", {
        style: {
          fontWeight: 700,
          borderTop: '2px solid #ccc'
        }
      }, plotEl("td", null, "Total tax"), td(sum(payRows, 'amount'), true), td(sum(payRows, 'net'), true), td(taxCollected, true)))));
    if (salesView === 'eod') {
      tbl = plotEl(PresaleEod, {
        key: allocDay || todayKey(),
        day: allocDay || todayKey(),
        rows: presalePaymentsOn(live, allocDay || todayKey()),
        actor,
        setToast
      });
    } else if (salesView === 'alloc') {
      const grp = {};
      allocRows.forEach(x => {
        const k = x.agentName || 'No agent';
        if (!grp[k]) grp[k] = { name: k, n: 0, amount: 0, agent: 0, broker: 0, company: 0 };
        grp[k].n += 1;
        grp[k].amount += x.amount;
        grp[k].agent += x.agent;
        grp[k].broker += x.broker;
        grp[k].company += x.company;
      });
      const pendAgent = fApps.reduce((n, r) => n + Math.max(0, presaleCommission(r) - presaleAlloc(r).reduce((m, x) => m + x.agent, 0)), 0);
      const heldBroker = fApps.reduce((n, r) => n + presaleAlloc(r).reduce((m, x) => m + x.broker, 0), 0);
      const dash = (label, v, color, note) => plotEl("div", {
        key: label,
        style: {
          flex: '1 1 170px',
          padding: 12,
          borderRadius: 10,
          background: color
        }
      }, plotEl("div", {
        style: {
          fontSize: 12,
          color: '#444'
        }
      }, label), plotEl("div", {
        style: {
          fontSize: 22,
          fontWeight: 800
        }
      }, fmt2(v)), note && plotEl("div", {
        style: {
          fontSize: 11,
          color: '#666'
        }
      }, note));
      const filt = (label, v, set) => plotEl("label", {
        key: label,
        style: {
          fontSize: 13
        }
      }, label, " ", plotEl("input", {
        value: v,
        onChange: e => set(e.target.value),
        style: {
          padding: 5,
          width: 120
        }
      }));
      const statusOf = r => {
        const L1 = presaleLedger(r);
        return L1.full ? 'Paid in full' : L1.paid > 0 ? `Paying · ${L1.monthsLeft} mo left` : 'No payment yet';
      };
      const secTitle = t => plotEl("div", {
        style: {
          fontWeight: 700,
          margin: '14px 0 6px'
        }
      }, t);
      tbl = plotEl("div", null, plotEl(PresaleRules, {
        canEdit: !!canEditRules,
        tick: ruleTick,
        setToast,
        actor
      }), plotEl("div", {
        style: {
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          alignItems: 'center',
          marginBottom: 10
        }
      }, plotEl("b", {
        style: {
          fontSize: 13
        }
      }, "Filter:"), filt('Agent', fAgent, setFAgent), filt('Broker', fBroker, setFBroker), filt('Plot / unit', fPlot, setFPlot)), plotEl("div", {
        style: {
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          marginBottom: 6
        }
      }, dash('Total payments received', sum(allocRows, 'amount'), '#fff3c9'), dash('Agent commission allocated', sum(allocRows, 'agent'), '#eef3fb'), dash('Broker / agent compensation allocated', sum(allocRows, 'broker'), '#f3e9fb'), dash('Company funds', sum(allocRows, 'company'), '#f1f8ec')), plotEl("div", {
        style: {
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap'
        }
      }, dash('Pending release: agent commission', pendAgent, '#fde8e6', 'commission still to be released (all time)'), dash('Held: broker / agent compensation', heldBroker, '#fde8e6', 'set aside, waiting for management rules (all time)')), secTitle('By agent'), plotEl("table", { className: "gh-table gh-table-dense" }, plotEl("thead", null, plotEl("tr", null, [['Agent', false], ['Transactions', true], ['Received', true], ['Commission', true], ['Compensation', true], ['Company', true]].map(([h, rr]) => th(h, rr)))), plotEl("tbody", null, Object.values(grp).map(g => plotEl("tr", {
        key: g.name
      }, plotEl("td", null, g.name), plotEl("td", {
        style: R
      }, g.n), td(g.amount), td(g.agent), td(g.broker), td(g.company))))), secTitle('Status by client'), plotEl("table", { className: "gh-table gh-table-dense" }, plotEl("thead", null, plotEl("tr", null, [['Client', false], ['Plot / unit', false], ['Agent', false], ['Status', false], ['Paid', true], ['Balance', true]].map(([h, rr]) => th(h, rr)))), plotEl("tbody", null, fApps.map(r => plotEl("tr", {
        key: r._id || r.ref
      }, plotEl("td", null, r.name), plotEl("td", null, presalePlots(r).map(p => p.plotCode).join(' ')), plotEl("td", null, r.agentName || '—'), plotEl("td", null, statusOf(r)), td(presaleLedger(r).paid), td(presaleLedger(r).balance))))), secTitle('Transaction log'), plotEl("table", { className: "gh-table gh-table-dense" }, plotEl("thead", null, plotEl("tr", null, allocCols.map(c => th(c[0], !!c[2])))), plotEl("tbody", null, allocRows.map((x, i) => plotEl("tr", {
        key: x.ref + i
      }, allocCols.map(c => c[2] ? td(x[c[1]], c[1] === 'amount') : plotEl("td", {
        key: c[1]
      }, c[1] === 'date' ? day(x.date) : x[c[1]] || '—')))), plotEl("tr", {
        style: {
          fontWeight: 700,
          borderTop: '2px solid #ccc'
        }
      }, plotEl("td", {
        colSpan: 8
      }, "Total · deposit to company bank account: ", fmt2(sum(allocRows, 'company'))), td(sum(allocRows, 'amount'), true), td(sum(allocRows, 'agent'), true), td(sum(allocRows, 'broker'), true), td(sum(allocRows, 'company'), true), plotEl("td", null, "")))));
    } else if (salesView === 'sales') {
      tbl = plotEl("table", { className: "gh-table gh-table-dense" }, plotEl("thead", null, plotEl("tr", null, [['Date', false], ['Ref', false], ['Buyer', false], ['Plots', false], ['Plot price', true], ['Surcharge', true], ['Total (with VAT)', true], ['Sales without VAT', true], ['VAT', true]].map(([h, r]) => th(h, r)))), plotEl("tbody", null, saleRows.map(x => plotEl("tr", {
        key: x.ref
      }, plotEl("td", null, day(x.date)), plotEl("td", null, x.ref), plotEl("td", null, x.name), plotEl("td", null, x.plots), td(x.base), td(x.surcharge), td(x.total, true), td(x.net), td(x.vat))), plotEl("tr", {
        style: {
          fontWeight: 700,
          borderTop: '2px solid #ccc'
        }
      }, plotEl("td", {
        colSpan: 4
      }, "Total"), td(sum(saleRows, 'base'), true), td(sum(saleRows, 'surcharge'), true), td(sum(saleRows, 'total'), true), td(sum(saleRows, 'net'), true), td(sum(saleRows, 'vat'), true))));
    } else if (salesView === 'vat') {
      tbl = plotEl("table", { className: "gh-table gh-table-dense" }, plotEl("thead", null, plotEl("tr", null, [['Date', false], ['Ref', false], ['Buyer', false], ['Receipt / reference', false], ['Amount received', true], ['Sales without VAT', true], ['VAT', true]].map(([h, r]) => th(h, r)))), plotEl("tbody", null, payRows.map((x, i) => plotEl("tr", {
        key: x.ref + i
      }, plotEl("td", null, day(x.date)), plotEl("td", null, x.ref), plotEl("td", null, x.name), plotEl("td", null, x.receipt), td(x.amount, true), td(x.net), td(x.vat))), plotEl("tr", {
        style: {
          fontWeight: 700,
          borderTop: '2px solid #ccc'
        }
      }, plotEl("td", {
        colSpan: 4
      }, "Total VAT collected"), td(sum(payRows, 'amount'), true), td(sum(payRows, 'net'), true), td(sum(payRows, 'vat'), true))));
    } else {
      tbl = plotEl("table", { className: "gh-table gh-table-dense" }, plotEl("thead", null, plotEl("tr", null, [['', false], ['Plot price', true], ['Installment surcharge', true], ['Total (with VAT)', true], ['VAT', true], ['Sales without VAT', true]].map(([h, r]) => th(h, r)))), plotEl("tbody", null, out.map(o => plotEl("tr", {
        key: o.label
      }, plotEl("td", null, o.label), td(o.base), td(o.surcharge), td(o.total, true), td(o.vat), td(o.net)))));
    }
    if (salesView === 'vat') tbl = plotEl("div", null, taxHead, plotEl("div", {
      style: {
        fontWeight: 700,
        margin: '14px 0 6px'
      }
    }, "Tax on each payment received"), tbl);
    const noRows = salesView === 'alloc' && !allocRows.length || salesView === 'sales' && !saleRows.length || salesView === 'vat' && !payRows.length;
    return plotEl("div", {
      className: "table-card",
      style: {
        padding: 16,
        marginBottom: 16,
        overflowX: 'auto'
      }
    }, plotEl("div", {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 10
      }
    }, plotEl("div", {
      style: {
        fontWeight: 700
      }
    }, "Sales and VAT (", Math.round(PRESALE_VAT_RATE * 100), "% VAT, prices include VAT)"), plotEl("label", {
      style: {
        fontSize: 13
      }
    }, "Period: ", plotEl("select", {
      value: period,
      onChange: e => setPeriod(e.target.value),
      style: {
        padding: 6,
        marginLeft: 4
      }
    }, plotEl("option", {
      value: "all"
    }, "All time"), months.map(k => plotEl("option", {
      key: k,
      value: k
    }, presaleMonthLabel(k)))))), plotEl("div", {
      style: {
        display: 'flex',
        gap: 6,
        flexWrap: 'wrap',
        marginBottom: 10,
        alignItems: 'center'
      }
    }, [['summary', 'Summary'], ['sales', 'Sales'], ['vat', 'Tax (VAT)'], ['alloc', 'Allocation'], ['eod', 'Deposit & end of day']].map(([id, label]) => plotEl("button", {
      key: id,
      className: `btn btn-sm ${salesView === id ? 'btn-primary' : 'btn-outline'}`,
      onClick: () => setSalesView(id)
    }, label)), (salesView === 'alloc' || salesView === 'eod') && plotEl("label", {
      style: {
        fontSize: 13,
        marginLeft: 8
      }
    }, "Day: ", plotEl("input", {
      type: "date",
      value: allocDay,
      onChange: e => setAllocDay(e.target.value),
      style: {
        padding: 5
      }
    }), allocDay && plotEl("button", {
      className: "btn btn-sm btn-outline",
      style: {
        marginLeft: 4
      },
      onClick: () => setAllocDay('')
    }, "All days")), salesView === 'alloc' && plotEl("button", {
      className: "btn btn-sm btn-outline",
      style: {
        marginLeft: 'auto'
      },
      disabled: noRows,
      onClick: printAlloc
    }, "🖨 Print transaction log"), salesView !== 'summary' && salesView !== 'eod' && plotEl("button", {
      className: "btn btn-sm btn-outline",
      style: salesView === 'alloc' ? null : {
        marginLeft: 'auto'
      },
      disabled: noRows,
      onClick: exportCsv
    }, "⬇ Download (Excel/CSV)")), plotEl("div", {
      style: {
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        flexWrap: 'wrap',
        margin: '4px 0 10px',
        padding: 10,
        borderRadius: 8,
        background: '#f6f1e8',
        fontSize: 13
      }
    }, plotEl("b", null, "Daily sales report:"), plotEl("input", {
      type: "date",
      value: reportDay,
      onChange: e => setReportDay(e.target.value),
      style: {
        padding: 5
      }
    }), plotEl("button", {
      className: "btn btn-sm btn-primary",
      onClick: printDaily
    }, "🖨 Print daily sales report")), noRows ? plotEl("div", {
      style: {
        padding: 12,
        color: '#777'
      }
    }, "Nothing in this period yet.") : tbl, plotEl("div", {
      style: {
        fontSize: 12,
        color: '#777',
        marginTop: 6
      }
    }, salesView === 'eod' ? "The totals fill in by themselves from the payments recorded on that day. Deposit instructions, the verification status and the final approval are saved for your records." : salesView === 'alloc' ? "Each sale's FIRST payment is split: 50% of the agent commission (7% of the plot price unless a commission amount was typed), 3% for broker and agent compensation, and the rest to the company. Later payments go fully to the company. Sales with no agent go fully to the company." : salesView === 'vat' ? "Tax is the 12% VAT inside the prices, figured on the money actually received in the chosen period (payments recorded by staff). Please confirm the rate and whether it applies with your accountant." : salesView === 'sales' ? "Sales are listed in the month the reservation was made. The installment surcharge is shown apart from the plot price." : "The installment surcharge (+10/15/20/30%) is shown apart from the plot price. VAT is taken out of the total."));
  })(), plotEl("div", {
    style: {
      display: 'flex',
      gap: 6,
      flexWrap: 'wrap',
      marginBottom: 14
    }
  }, [['all', 'All'], ['new', 'New'], ['verified', 'Verified'], ['paid', 'Paid'], ['cash', 'Spot cash'], ['installment', 'Monthly'], ['cancelled', 'Cancelled']].map(([id, label]) => plotEl("button", {
    key: id,
    className: `btn btn-sm ${filter === id ? 'btn-primary' : 'btn-outline'}`,
    onClick: () => setFilter(id)
  }, label))), plotEl("div", {
    className: "table-card"
  }, shown.length === 0 ? plotEl("div", {
    style: {
      padding: 24
    }
  }, "No presale applications here yet.") : plotEl("table", { className: "gh-table" }, plotEl("thead", null, plotEl("tr", null, ['Ref', 'Buyer', 'Plot', 'Plan', 'Pays by', 'Status'].map(h => plotEl("th", {
    key: h
  }, h)))), plotEl("tbody", null, shown.map(r => plotEl("tr", {
    key: r._id,
    style: {
      cursor: 'pointer'
    },
    onClick: () => {
      setOpen(r._id);
      setRefText('');
      setAmtText(String(Math.min(presaleLedger(r).balance || r.totalPrice, r.plan === 'cash' ? r.totalPrice : r.monthly)));
    }
  }, plotEl("td", null, r.ref), plotEl("td", null, r.name, plotEl("div", {
    style: {
      fontSize: 12,
      color: '#777'
    }
  }, r.mobile)), plotEl("td", null, presalePlots(r).map(x => x.plotCode).join(', '), plotEl("div", {
    style: {
      fontSize: 12,
      color: '#777'
    }
  }, presalePlots(r).length > 1 ? `${presalePlots(r).length} plots` : PRESALE_TYPE_LABEL[r.typeId])), plotEl("td", null, presalePlanText(r)), plotEl("td", null, PRESALE_METHOD_LABEL[r.method] || r.method), plotEl("td", null, statusBadge(r.status, r))))))), sel && plotEl("div", {
    className: "modal-bg",
    onClick: e => e.target === e.currentTarget && setOpen(null)
  }, plotEl("div", {
    className: "modal"
  }, plotEl("h3", null, sel.ref, " · ", presalePlots(sel).length > 1 ? `${presalePlots(sel).length} plots` : `${sel.plotCode} · ${PRESALE_TYPE_LABEL[sel.typeId]}`), presalePlots(sel).length > 1 && plotEl("div", {
    style: {
      lineHeight: 1.6,
      marginBottom: 6
    }
  }, presalePlots(sel).map(x => plotEl("div", {
    key: x.plotCode
  }, plotEl("b", null, x.plotCode), " · ", PRESALE_TYPE_LABEL[x.typeId], x.price ? ` · ${fmt(x.price)}` : ''))), statusBadge(sel.status, sel), plotEl("div", {
    style: {
      margin: '12px 0',
      padding: 12,
      borderRadius: 8,
      background: sel.plan === 'cash' ? '#e8f5e9' : '#fff3e0'
    }
  }, plotEl("b", null, sel.plan === 'cash' ? 'SPOT CASH' : 'MONTHLY INSTALLMENT'), plotEl("div", null, sel.plan === 'cash' ? `Pays ${fmt(sel.totalPrice)} in full` : `${sel.years} years · ${fmt(sel.monthly)} a month · total ${fmt(sel.totalPrice)}` + (sel.customMonthly > 0 ? ` · buyer plans to pay ${fmt(sel.customMonthly)} a month` : '')), plotEl("div", null, "Pays by: ", plotEl("b", null, PRESALE_METHOD_LABEL[sel.method] || sel.method))), plotEl("div", {
    style: {
      lineHeight: 1.7
    }
  }, plotEl("div", null, plotEl("b", null, "Name: "), sel.name), plotEl("div", null, plotEl("b", null, "Address: "), sel.address), plotEl("div", null, plotEl("b", null, "Mobile: "), sel.mobile), plotEl("div", null, plotEl("b", null, "Email: "), sel.email), plotEl("div", null, plotEl("b", null, "Sent: "), fmtDate(sel.createdAt))), sel.status !== 'cancelled' && (() => {
    const L = presaleLedger(sel);
    return plotEl("div", {
      style: {
        marginTop: 12,
        padding: 12,
        borderRadius: 8,
        background: L.full ? '#e8f5e9' : '#f6f1e8'
      }
    }, plotEl("b", null, "Payments"), (() => {
      const v = presaleVat(sel.totalPrice);
      const sp = presaleSplit(sel);
      return plotEl("div", {
        style: {
          fontSize: 13,
          color: '#555',
          margin: '2px 0 6px',
          lineHeight: 1.5
        }
      }, sel.plan === 'installment' && plotEl("div", null, "Plot price ", fmt2(sp.base), " + installment surcharge ", fmt2(sp.surcharge), " = ", fmt2(sp.total)), plotEl("div", null, "Sales ", fmt2(v.net), " + VAT ", fmt2(v.vat), " = ", fmt2(v.gross)));
    })(), plotEl("div", null, "Paid ", fmt(L.paid), " of ", fmt(sel.totalPrice), " · balance ", plotEl("b", null, fmt(L.balance))), sel.plan === 'installment' && (L.full ? plotEl("div", null, "✔ Fully paid") : plotEl("div", null, "Months paid: ", plotEl("b", null, L.monthsPaid), " · Months left: ", plotEl("b", null, L.monthsLeft), L.nextDue ? ` · Next due ${fmtDate(L.nextDue.getTime())}` : '')), L.list.length > 0 && plotEl("table", {
      className: "gh-table",
      style: {
        width: '100%',
        fontSize: 13,
        marginTop: 8
      }
    }, plotEl("tbody", null, L.list.map((x, i) => plotEl("tr", {
      key: i
    }, plotEl("td", null, fmtDate(x.date)), plotEl("td", null, fmt(x.amount)), plotEl("td", null, x.ref || ''), plotEl("td", null, x.by || ''))))));
  })(), sel.status !== 'cancelled' && plotEl("div", {
    style: {
      marginTop: 12,
      padding: 12,
      borderRadius: 8,
      background: '#eef3fb'
    }
  }, plotEl("b", null, "Agent commission"), sel.agentId ? plotEl("div", null, sel.agentName, " · ", fmt(sel.agentCommission || 0), " · due 1 year after the sale (", fmtDate(agentDates(sel.createdAt || Date.now()).dueDate), ")") : plotEl("div", null, plotEl("select", {
    style: {
      padding: 8,
      width: '100%',
      boxSizing: 'border-box',
      marginTop: 6
    },
    value: agentPick,
    onChange: e => {
      const id = e.target.value;
      setAgentPick(id);
      const ag = agentList.find(x => x._id === id);
      if (ag && ag.rate) setCommText(String(Math.round(presaleSplit(sel).base * ag.rate / 100)));
    }
  }, plotEl("option", {
    value: ""
  }, "No agent / choose agent…"), agentList.map(a => plotEl("option", {
    key: a._id,
    value: a._id
  }, a.name))), agentPick && plotEl("div", null, plotEl("input", {
    style: {
      padding: 8,
      width: '100%',
      boxSizing: 'border-box',
      marginTop: 6
    },
    inputMode: "numeric",
    placeholder: "Commission amount (₱)",
    value: commText,
    onChange: e => setCommText(e.target.value)
  }), plotEl("button", {
    className: "btn btn-primary btn-sm",
    style: {
      marginTop: 6
    },
    disabled: busy,
    onClick: () => attachAgent(sel)
  }, "Save agent and commission")))), sel.status !== 'cancelled' && plotEl("div", {
    style: {
      marginTop: 12,
      padding: 10,
      borderRadius: 8,
      background: '#eef3fb'
    }
  }, plotEl("b", null, "Broker (optional)"), sel.brokerName && plotEl("div", null, sel.brokerName), plotEl("div", {
    style: {
      display: 'flex',
      gap: 6,
      marginTop: 6
    }
  }, plotEl("input", {
    style: {
      padding: 8,
      flex: 1,
      boxSizing: 'border-box'
    },
    placeholder: "Broker name",
    value: brokerText,
    onChange: e => setBrokerText(e.target.value)
  }), plotEl("button", {
    className: "btn btn-primary btn-sm",
    disabled: busy || !brokerText.trim(),
    onClick: async () => {
      setBusy(true);
      try {
        await window.db.collection('presaleApplications').doc(sel._id).update({
          brokerName: brokerText.trim()
        });
        setBrokerText('');
        setToast('Broker saved');
      } catch (err) {
        setToast(err && err.message || 'Could not save');
      } finally {
        setBusy(false);
      }
    }
  }, "Save"))), (() => {
    const al = presaleAlloc(sel);
    if (!sel.agentId || !al.length) return null;
    const t = k => al[0][k];
    return plotEl("div", {
      style: {
        marginTop: 12,
        padding: 10,
        borderRadius: 8,
        background: '#f1f8ec',
        fontSize: 13,
        lineHeight: 1.6
      }
    }, plotEl("b", null, "Where the first payment goes"), plotEl("div", null, "Agent commission: ", fmt2(t('agent'))), plotEl("div", null, "Broker and agent compensation (held): ", fmt2(t('broker'))), plotEl("div", null, "Company deposit: ", fmt2(t('company'))));
  })(), plotEl("div", {
    style: {
      marginTop: 12,
      padding: 10,
      borderRadius: 8,
      background: '#f6f1e8',
      fontSize: 13
    }
  }, "Identity check: call the buyer, or meet at the office, and confirm the name and address above."), sel.status !== 'cancelled' && !presaleLedger(sel).full && plotEl("div", {
    style: {
      marginTop: 12
    }
  }, sel.status === 'new' && plotEl("button", {
    className: "btn btn-outline",
    disabled: busy,
    style: {
      marginBottom: 10
    },
    onClick: () => update(sel, {
      status: 'verified',
      verifiedBy: actor,
      verifiedAt: Date.now()
    }, 'Marked as verified')
  }, "✔ Name and address checked"), plotEl("label", {
    style: {
      display: 'block',
      fontSize: 13,
      fontWeight: 600,
      marginBottom: 4
    }
  }, "Amount received (₱) — you may enter more than the monthly, never less", plotEl("div", {
    style: {
      fontWeight: 400,
      color: '#777'
    }
  }, (() => {
    const L = presaleLedger(sel);
    return `Minimum: ${fmt(Math.min(L.monthly, L.balance))}`;
  })())), plotEl("input", {
    style: {
      width: '100%',
      boxSizing: 'border-box',
      padding: 8,
      marginBottom: 10
    },
    inputMode: "numeric",
    value: amtText,
    onChange: e => setAmtText(e.target.value)
  }), plotEl("label", {
    style: {
      display: 'block',
      fontSize: 13,
      fontWeight: 600,
      marginBottom: 4
    }
  }, sel.method === 'cheque' ? 'Cheque number' : sel.method === 'cash' ? 'Official receipt number' : sel.method === 'gcash' ? 'GCash reference number' : 'Bank reference number'), plotEl("input", {
    style: {
      width: '100%',
      boxSizing: 'border-box',
      padding: 8,
      marginBottom: 10
    },
    value: refText,
    onChange: e => setRefText(e.target.value)
  }), plotEl("input", {
    style: {
      width: '100%',
      boxSizing: 'border-box',
      padding: 8,
      marginBottom: 10
    },
    placeholder: "Remarks (optional)",
    value: remarksText,
    onChange: e => setRemarksText(e.target.value)
  }), plotEl("button", {
    className: "btn btn-primary",
    disabled: busy,
    onClick: () => confirmPaid(sel)
  }, "Record payment received"), plotEl("label", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      marginTop: 8,
      fontSize: 12
    }
  }, plotEl("input", {
    type: "checkbox",
    checked: autoSheet,
    onChange: e => toggleAutoSheet(e.target.checked)
  }), "Open the customer sheet for checking after each payment"), plotEl("label", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      marginTop: 6,
      fontSize: 12
    }
  }, plotEl("input", {
    type: "checkbox",
    checked: emailAR,
    onChange: e => toggleEmailAR(e.target.checked)
  }), "Email the buyer an acknowledgement receipt after each payment"), sheetData && plotEl(CustomerSheetEditor, {
    data: sheetData,
    onClose: () => setSheetData(null),
    onToast: setToast
  }), lastPay && lastPay.ref === sel.ref && plotEl("div", {
    style: {
      marginTop: 12,
      padding: 12,
      borderRadius: 8,
      background: '#e8f5e9',
      border: '2px solid #2e9e5b',
      lineHeight: 1.6,
      fontSize: 14
    }
  }, plotEl("b", null, "✔ Payment received"), plotEl("div", null, "Reference: ", lastPay.receipt, " · ", lastPay.method), plotEl("div", null, lastPay.name, " · ", lastPay.plots), plotEl("div", null, new Date(lastPay.when).toLocaleString('en-PH')), plotEl("div", {
    style: {
      fontWeight: 700
    }
  }, "Amount: ", fmt2(lastPay.amount)), plotEl("div", {
    style: {
      marginTop: 6
    }
  }, plotEl("b", null, "Allocation breakdown")), plotEl("div", null, "Agent commission: ", fmt2(lastPay.agent)), plotEl("div", null, "Broker and agent compensation (held): ", fmt2(lastPay.broker)), plotEl("div", null, "Company operating account: ", fmt2(lastPay.company)), plotEl("button", {
    className: "btn btn-outline btn-sm",
    style: {
      marginTop: 8
    },
    onClick: () => {
      const w = window.open('', '_blank');
      if (!w) return;
      const e = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;');
      w.document.write('<html><head><title>Payment Confirmation</title><style>body{font-family:Arial,sans-serif;padding:24px;font-size:14px;line-height:1.7}h2{margin:0}</style></head><body><h2>Golden Harmonic Memorial Park</h2><div><b>Payment Confirmation</b></div><br>Reference: ' + e(lastPay.receipt) + ' (' + e(lastPay.method) + ')<br>Application: ' + e(lastPay.ref) + '<br>Client: ' + e(lastPay.name) + '<br>Plot / unit: ' + e(lastPay.plots) + '<br>Date and time: ' + e(new Date(lastPay.when).toLocaleString('en-PH')) + '<br><b>Amount received: ' + e(fmt2(lastPay.amount)) + '</b><br><br><b>Allocation breakdown</b><br>Agent commission: ' + e(fmt2(lastPay.agent)) + '<br>Broker and agent compensation (held): ' + e(fmt2(lastPay.broker)) + '<br>Company operating account: ' + e(fmt2(lastPay.company)) + '<br><br>Received by: ____________________' + '</body></html>');
      w.document.close();
      w.focus();
      w.print();
    }
  }, "🖨 Print internal copy (with allocation)"), plotEl("button", {
    className: "btn btn-primary btn-sm",
    style: {
      marginTop: 8,
      marginLeft: 6
    },
    onClick: () => {
      const w = window.open('', '_blank');
      if (!w) return;
      const e = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;');
      const row = (k, v) => '<tr><td style="padding:6px 0;color:#555;width:45%;border-top:1px solid #ddd">' + k + '</td><td style="padding:6px 0;border-top:1px solid #ddd"><b>' + v + '</b></td></tr>';
      w.document.write('<html><head><title>Acknowledgement Receipt</title><style>body{font-family:Arial,sans-serif;padding:28px;font-size:14px;line-height:1.6;max-width:640px;margin:0 auto}h2{margin:0}table{width:100%;border-collapse:collapse}.t{font-size:22px;font-weight:bold;letter-spacing:.05em;margin:14px 0 2px}.s{font-size:12px;color:#555}</style></head><body><div style="display:flex;align-items:center;gap:14px"><img src="' + window.location.origin + '/logo-192.png" width="72" height="72" alt=""><div><h2>Golden Harmonic Memorial Park</h2><div class="s">Taytay, Palawan</div></div></div><div class="t">ACKNOWLEDGEMENT RECEIPT</div><div class="s">No. AR-' + e(lastPay.ref) + '-' + (lastPay.index + 1) + '</div><p>Received from <b>' + e(lastPay.name) + '</b> the amount below. Thank you.</p><table>' + row('Date and time', e(new Date(lastPay.when).toLocaleString('en-PH'))) + row('Amount received', e(fmt2(lastPay.amount))) + row('Paid by', e(lastPay.method)) + (lastPay.receipt ? row('Receipt / reference no.', e(lastPay.receipt)) : '') + row('Reservation no.', e(lastPay.ref)) + row('Plot / unit', e(lastPay.plots)) + row('Total contract price', e(fmt2(lastPay.total))) + row('Total paid so far', e(fmt2(lastPay.paidSoFar))) + row('Balance', e(fmt2(lastPay.balance))) + '</table><p class="s" style="margin-top:16px">This is an acknowledgement of payment received. It is not an official receipt. Our office will issue your official receipt.</p><br><br>Received by: ____________________ &nbsp;&nbsp; Signature over printed name</body></html>');
      w.document.close();
      w.focus();
      w.print();
    }
  }, "🖨 Print acknowledgement receipt"), lastPay.email && plotEl("button", {
    className: "btn btn-outline btn-sm",
    style: {
      marginTop: 8,
      marginLeft: 6
    },
    onClick: () => sendAR(lastPay.ref, lastPay.index)
  }, "✉ Email to ", lastPay.email))), plotEl("div", {
    style: {
      display: 'flex',
      gap: 8,
      marginTop: 16,
      justifyContent: 'space-between'
    }
  }, sel.status !== 'cancelled' && sel.status !== 'paid' ? plotEl("button", {
    className: "btn btn-outline btn-sm",
    disabled: busy,
    onClick: () => cancelApp(sel)
  }, "Cancel and free this plot") : plotEl("span", null), plotEl("button", {
    className: "btn btn-outline btn-sm",
    onClick: () => setSheetData(presaleSheetData(sel))
  }, "📝 Customer sheet (edit, then Word)"), plotEl("button", {
    className: "btn btn-outline btn-sm",
    onClick: () => setOpen(null)
  }, "Close")))));
}

// ── Agents and their 1-year commissions ──────────────────────────────────────
// agents/{id}: the sales agents. agentCommissions/{id}: one record per sale an agent
// earns commission on. The commission falls due 12 months after the sale date and
// staff are warned (here and by email, via /api/send-agent-commissions) at month 11.
const AGENT_DUE_MONTHS = 12;
const AGENT_NOTIFY_MONTHS = 11;
function agentAddMonths(ms, n) {
  const d = new Date(ms);
  d.setMonth(d.getMonth() + n);
  return d.getTime();
}
function agentDates(saleMs) {
  return {
    notifyDate: agentAddMonths(saleMs, AGENT_NOTIFY_MONTHS),
    dueDate: agentAddMonths(saleMs, AGENT_DUE_MONTHS)
  };
}
// 'paid' | 'overdue' | 'soon' (past month 11, not yet due) | 'waiting'
function agentCommStatus(c, now) {
  if (c.status === 'paid') return 'paid';
  if (now >= c.dueDate) return 'overdue';
  if (now >= c.notifyDate) return 'soon';
  return 'waiting';
}
function agentDaysLeft(c, now) {
  return Math.ceil((c.dueDate - now) / 86400000);
}
function AgentsTab({
  currentUser
}) {
  const [agents, setAgents] = useState(null);
  const [comms, setComms] = useState(null);
  const [filter, setFilter] = useState('alert');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [af, setAf] = useState({
    name: '',
    mobile: '',
    email: '',
    rate: ''
  });
  const today = new Date().toISOString().slice(0, 10);
  const [cf, setCf] = useState({
    agentId: '',
    buyer: '',
    ref: '',
    saleDate: today,
    saleAmount: '',
    commission: ''
  });
  useEffect(() => window.db.collection('agents').orderBy('createdAt', 'desc').onSnapshot(s => setAgents(s.docs.map(d => ({
    _id: d.id,
    ...d.data()
  }))), () => setAgents([])), []);
  useEffect(() => window.db.collection('agentCommissions').orderBy('dueDate', 'asc').onSnapshot(s => setComms(s.docs.map(d => ({
    _id: d.id,
    ...d.data()
  }))), () => setComms([])), []);
  if (!agents || !comms) return plotEl("div", {
    className: "loading"
  }, plotEl("div", {
    className: "spinner"
  }), plotEl("div", null, "Loading agents…"));
  const actor = currentUser && currentUser.email || 'staff';
  const now = Date.now();
  const money = v => Math.round(Number(String(v).replace(/[^0-9.]/g, '')) || 0);
  const addAgent = async () => {
    if (af.name.trim().length < 2) {
      setToast('Please write the agent name.');
      return;
    }
    setBusy(true);
    try {
      await window.db.collection('agents').add({
        name: af.name.trim(),
        mobile: af.mobile.trim(),
        email: af.email.trim(),
        rate: Number(af.rate) || 0,
        active: true,
        createdAt: Date.now(),
        createdBy: actor
      });
      setAf({
        name: '',
        mobile: '',
        email: '',
        rate: ''
      });
      setToast('Agent added');
    } catch (e) {
      setToast(e.message || 'Could not save');
    } finally {
      setBusy(false);
    }
  };
  const removeAgent = async a => {
    if (!window.confirm(`Remove agent ${a.name}? Their commission records stay.`)) return;
    try {
      await window.db.collection('agents').doc(a._id).delete();
    } catch (e) {
      setToast(e.message || 'Could not remove');
    }
  };
  const addCommission = async () => {
    const agent = agents.find(a => a._id === cf.agentId);
    if (!agent) {
      setToast('Please choose the agent.');
      return;
    }
    const comm = money(cf.commission);
    if (!(comm > 0)) {
      setToast('Please write the commission amount.');
      return;
    }
    const saleMs = new Date(cf.saleDate + 'T00:00:00').getTime();
    if (!saleMs) {
      setToast('Please choose the sale date.');
      return;
    }
    setBusy(true);
    try {
      await window.db.collection('agentCommissions').add({
        agentId: agent._id,
        agentName: agent.name,
        agentEmail: agent.email || '',
        buyer: cf.buyer.trim(),
        ref: cf.ref.trim(),
        saleAmount: money(cf.saleAmount),
        commission: comm,
        saleDate: saleMs,
        ...agentDates(saleMs),
        status: 'pending',
        notifiedAt: null,
        createdAt: Date.now(),
        createdBy: actor
      });
      setCf({
        agentId: '',
        buyer: '',
        ref: '',
        saleDate: today,
        saleAmount: '',
        commission: ''
      });
      setToast('Commission recorded');
    } catch (e) {
      setToast(e.message || 'Could not save');
    } finally {
      setBusy(false);
    }
  };
  const markPaid = async c => {
    if (!window.confirm(`Mark the ${fmt(c.commission)} commission for ${c.agentName} as PAID?`)) return;
    try {
      await window.db.collection('agentCommissions').doc(c._id).update({
        status: 'paid',
        paidAt: Date.now(),
        paidBy: actor
      });
      setToast('Marked as paid');
    } catch (e) {
      setToast(e.message || 'Could not save');
    }
  };
  const removeComm = async c => {
    if (!window.confirm('Delete this commission record?')) return;
    try {
      await window.db.collection('agentCommissions').doc(c._id).delete();
    } catch (e) {
      setToast(e.message || 'Could not delete');
    }
  };
  const withState = comms.map(c => ({
    ...c,
    st: agentCommStatus(c, now)
  }));
  const alerts = withState.filter(c => c.st === 'soon' || c.st === 'overdue');
  const pendingTotal = withState.filter(c => c.st !== 'paid').reduce((n, c) => n + (c.commission || 0), 0);
  const shown = withState.filter(c => filter === 'all' ? true : filter === 'alert' ? c.st === 'soon' || c.st === 'overdue' : filter === 'pending' ? c.st !== 'paid' : c.st === 'paid');
  const stat = (n, label) => plotEl("div", {
    className: "stat-card"
  }, plotEl("div", null, plotEl("div", {
    className: "stat-num"
  }, n), plotEl("div", {
    className: "stat-lbl"
  }, label)));
  const badge = c => c.st === 'paid' ? plotEl("span", {
    className: "badge badge-converted"
  }, "Paid") : c.st === 'overdue' ? plotEl("span", {
    className: "badge",
    style: {
      background: '#fde8e6',
      color: '#a33'
    }
  }, "Due now / overdue") : c.st === 'soon' ? plotEl("span", {
    className: "badge badge-new"
  }, `Due in ${agentDaysLeft(c, now)} days`) : plotEl("span", {
    className: "badge badge-contacted"
  }, "Waiting");
  const inp = {
    padding: 8,
    width: '100%',
    boxSizing: 'border-box'
  };
  const lbl = {
    fontSize: 12,
    fontWeight: 600,
    display: 'block',
    marginBottom: 2
  };
  const pickAgent = id => {
    const a = agents.find(x => x._id === id);
    setCf(f => ({
      ...f,
      agentId: id,
      commission: a && a.rate && f.saleAmount ? String(Math.round(money(f.saleAmount) * a.rate / 100)) : f.commission
    }));
  };
  const setSaleAmount = v => {
    const a = agents.find(x => x._id === cf.agentId);
    setCf(f => ({
      ...f,
      saleAmount: v,
      commission: a && a.rate ? String(Math.round(money(v) * a.rate / 100)) : f.commission
    }));
  };
  return plotEl("div", null, toast && plotEl(Toast, {
    msg: toast,
    onDone: () => setToast('')
  }), plotEl("div", {
    className: "section-hd"
  }, plotEl("h2", null, "Agents and commissions")), plotEl("div", {
    className: "stats-row",
    style: {
      gridTemplateColumns: 'repeat(4,minmax(0,1fr))',
      marginBottom: 16
    }
  }, stat(agents.length, 'Agents'), stat(alerts.length, 'Commissions to prepare'), stat(withState.filter(c => c.st !== 'paid').length, 'Unpaid commissions'), stat(fmt(pendingTotal), 'Unpaid total')), alerts.length > 0 && plotEl("div", {
    style: {
      background: '#fff3c9',
      border: '2px solid #d9a62e',
      borderRadius: 10,
      padding: 14,
      marginBottom: 16
    }
  }, plotEl("b", null, "🔔 Commissions due soon (the 1-year mark is near)"), alerts.map(c => plotEl("div", {
    key: c._id,
    style: {
      marginTop: 6
    }
  }, c.agentName, " · ", fmt(c.commission), " · ", c.buyer || c.ref || 'sale', " · due ", fmtDate(c.dueDate), c.st === 'overdue' ? ' (now due)' : ` (in ${agentDaysLeft(c, now)} days)`))), plotEl("div", {
    className: "table-card",
    style: {
      padding: 16,
      marginBottom: 16
    }
  }, plotEl("div", {
    style: {
      fontWeight: 700,
      marginBottom: 8
    }
  }, "Add an agent"), plotEl("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))',
      gap: 10
    }
  }, [['name', 'Name'], ['mobile', 'Mobile'], ['email', 'Email (for notices)'], ['rate', 'Commission % (optional)']].map(([k, label]) => plotEl("div", {
    key: k
  }, plotEl("label", {
    style: lbl
  }, label), plotEl("input", {
    style: inp,
    value: af[k],
    onChange: e => setAf({
      ...af,
      [k]: e.target.value
    })
  })))), plotEl("button", {
    className: "btn btn-primary",
    style: {
      marginTop: 10
    },
    disabled: busy,
    onClick: addAgent
  }, "Add agent"), agents.length > 0 && plotEl("table", {
    className: "gh-table",
    style: {
      marginTop: 12
    }
  }, plotEl("thead", null, plotEl("tr", null, ['Agent', 'Mobile', 'Email', 'Commission %', ''].map(h => plotEl("th", {
    key: h || 'x'
  }, h)))), plotEl("tbody", null, agents.map(a => plotEl("tr", {
    key: a._id
  }, plotEl("td", null, a.name), plotEl("td", null, a.mobile), plotEl("td", null, a.email), plotEl("td", null, a.rate ? a.rate + '%' : '—'), plotEl("td", null, plotEl("button", {
    className: "btn btn-outline btn-sm",
    onClick: () => removeAgent(a)
  }, "Remove"))))))), plotEl("div", {
    className: "table-card",
    style: {
      padding: 16,
      marginBottom: 16
    }
  }, plotEl("div", {
    style: {
      fontWeight: 700,
      marginBottom: 4
    }
  }, "Record a commission"), plotEl("div", {
    style: {
      fontSize: 12,
      color: '#777',
      marginBottom: 8
    }
  }, "The commission falls due 1 year after the sale date. We warn you (and email you and the agent) when 11 months have passed."), plotEl("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))',
      gap: 10
    }
  }, plotEl("div", null, plotEl("label", {
    style: lbl
  }, "Agent"), plotEl("select", {
    style: inp,
    value: cf.agentId,
    onChange: e => pickAgent(e.target.value)
  }, plotEl("option", {
    value: ""
  }, "Choose…"), agents.map(a => plotEl("option", {
    key: a._id,
    value: a._id
  }, a.name)))), plotEl("div", null, plotEl("label", {
    style: lbl
  }, "Buyer name"), plotEl("input", {
    style: inp,
    value: cf.buyer,
    onChange: e => setCf({
      ...cf,
      buyer: e.target.value
    })
  })), plotEl("div", null, plotEl("label", {
    style: lbl
  }, "Reference (e.g. PS-0001, plot)"), plotEl("input", {
    style: inp,
    value: cf.ref,
    onChange: e => setCf({
      ...cf,
      ref: e.target.value
    })
  })), plotEl("div", null, plotEl("label", {
    style: lbl
  }, "Sale date"), plotEl("input", {
    type: "date",
    style: inp,
    value: cf.saleDate,
    onChange: e => setCf({
      ...cf,
      saleDate: e.target.value
    })
  })), plotEl("div", null, plotEl("label", {
    style: lbl
  }, "Sale amount (₱)"), plotEl("input", {
    style: inp,
    inputMode: "numeric",
    value: cf.saleAmount,
    onChange: e => setSaleAmount(e.target.value)
  })), plotEl("div", null, plotEl("label", {
    style: lbl
  }, "Commission amount (₱)"), plotEl("input", {
    style: inp,
    inputMode: "numeric",
    value: cf.commission,
    onChange: e => setCf({
      ...cf,
      commission: e.target.value
    })
  }))), plotEl("button", {
    className: "btn btn-primary",
    style: {
      marginTop: 10
    },
    disabled: busy,
    onClick: addCommission
  }, "Save commission")), plotEl("div", {
    style: {
      display: 'flex',
      gap: 6,
      flexWrap: 'wrap',
      marginBottom: 14
    }
  }, [['alert', 'Due soon'], ['pending', 'Unpaid'], ['paid', 'Paid'], ['all', 'All']].map(([id, label]) => plotEl("button", {
    key: id,
    className: `btn btn-sm ${filter === id ? 'btn-primary' : 'btn-outline'}`,
    onClick: () => setFilter(id)
  }, label))), plotEl("div", {
    className: "table-card"
  }, shown.length === 0 ? plotEl("div", {
    style: {
      padding: 24
    }
  }, "No commissions here yet.") : plotEl("table", { className: "gh-table" }, plotEl("thead", null, plotEl("tr", null, ['Agent', 'Sale', 'Sale date', 'Commission', 'Due date', 'Status', ''].map(h => plotEl("th", {
    key: h || 'x'
  }, h)))), plotEl("tbody", null, shown.map(c => plotEl("tr", {
    key: c._id
  }, plotEl("td", null, c.agentName), plotEl("td", null, c.buyer || '—', plotEl("div", {
    style: {
      fontSize: 12,
      color: '#777'
    }
  }, c.ref)), plotEl("td", null, fmtDate(c.saleDate)), plotEl("td", null, fmt(c.commission)), plotEl("td", null, fmtDate(c.dueDate), plotEl("div", {
    style: {
      fontSize: 12,
      color: '#777'
    }
  }, "warn on ", fmtDate(c.notifyDate))), plotEl("td", null, badge(c)), plotEl("td", null, c.st !== 'paid' && plotEl("button", {
    className: "btn btn-primary btn-sm",
    onClick: () => markPaid(c)
  }, "Mark paid"), ' ', plotEl("button", {
    className: "btn btn-outline btn-sm",
    onClick: () => removeComm(c)
  }, "✕"))))))));
}

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
  id: 'presale',
  label: 'Presale',
  ico: '📋',
  badge: 2
}, {
  id: 'agents',
  label: 'Agents',
  ico: '🤝',
  badge: 0
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
    pending: 0,
    presale: 0,
    agents: 0
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
    const presaleUnsub = window.db.collection('presaleApplications').onSnapshot(snap => setCounts(c => ({
      ...c,
      presale: snap.docs.filter(d => d.data().status === 'new').length
    })), () => {});
    // Agents tab badge: unpaid commissions that reached month 11
    const agentsUnsub = window.db.collection('agentCommissions').onSnapshot(snap => setCounts(c => ({
      ...c,
      agents: snap.docs.filter(d => {
        const x = d.data();
        return x.status !== 'paid' && Date.now() >= x.notifyDate;
      }).length
    })), () => {});
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
      presaleUnsub();
      agentsUnsub();
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
  }), tab === 'presale' && /*#__PURE__*/React.createElement(PresaleApplications, {
    currentUser: user,
    canEditRules: isAdminOrHigher
  }), tab === 'agents' && /*#__PURE__*/React.createElement(AgentsTab, {
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
