import { jsxDEV as _jsxDEV, Fragment as _Fragment } from "react/jsx-dev-runtime";
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
  price: 60000,
  sortOrder: 1,
  desc: 'A standard single-interment lot in our open-lawn sections.',
  features: ['1 interment space', 'Perpetual care included', 'Open-lawn setting']
}, {
  id: 'premium',
  name: 'Premium Plot',
  category: 'Regular Plots',
  price: 85000,
  sortOrder: 2,
  desc: 'An upgraded standard plot in one of the park\'s preferred sections.',
  features: ['1 interment space', 'Perpetual care included', 'Preferred section placement']
}, {
  id: 'corner-premium',
  name: 'Corner Premium Plot',
  category: 'Regular Plots',
  price: 95000,
  sortOrder: 3,
  desc: 'A corner plot in our most requested standard section.',
  features: ['1 interment space', 'Perpetual care included', 'Corner placement']
}, {
  id: 'garden-regular',
  name: 'Regular Garden Plot',
  category: 'Garden Plots',
  price: 75000,
  sortOrder: 4,
  desc: 'A single-interment lot within our landscaped garden sections.',
  features: ['1 interment space', 'Perpetual care included', 'Garden setting']
}, {
  id: 'garden-premium',
  name: 'Premium Garden Plot',
  category: 'Garden Plots',
  price: 95000,
  sortOrder: 5,
  desc: 'An upgraded garden plot in a preferred section of the garden.',
  features: ['1 interment space', 'Perpetual care included', 'Preferred garden section']
}, {
  id: 'garden-corner',
  name: 'Corner Prime Garden Plot',
  category: 'Garden Plots',
  price: 115000,
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
  return /*#__PURE__*/_jsxDEV("div", {
    className: "toast",
    children: msg
  }, void 0, false);
}

// ── Login ──────────────────────────────────────────────────────────────────
function Login({
  onLogin
}) {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async e => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const cred = await window.auth.signInWithEmailAndPassword(email, pass);
      onLogin(cred.user);
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
  return /*#__PURE__*/_jsxDEV("div", {
    className: "login-wrap",
    children: /*#__PURE__*/_jsxDEV("div", {
      className: "login-card",
      children: [/*#__PURE__*/_jsxDEV("div", {
        className: "login-logo",
        children: [/*#__PURE__*/_jsxDEV("img", {
          src: "/logo-header.png",
          alt: "Golden Harmonic logo",
          style: {
            width: 44,
            height: 44,
            objectFit: 'contain',
            flexShrink: 0
          }
        }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
          children: [/*#__PURE__*/_jsxDEV("div", {
            className: "login-title",
            children: "Golden Harmonic"
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            className: "login-sub",
            children: "Memorial Park · Admin Panel"
          }, void 0, false)]
        }, void 0, true)]
      }, void 0, true), /*#__PURE__*/_jsxDEV("form", {
        onSubmit: submit,
        children: [/*#__PURE__*/_jsxDEV("div", {
          className: "login-field",
          children: [/*#__PURE__*/_jsxDEV("label", {
            children: "Email address"
          }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
            type: "email",
            required: true,
            placeholder: "admin@ghmemorialpark.com",
            value: email,
            onChange: e => setEmail(e.target.value)
          }, void 0, false)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          className: "login-field",
          children: [/*#__PURE__*/_jsxDEV("label", {
            children: "Password"
          }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
            type: "password",
            required: true,
            placeholder: "••••••••",
            value: pass,
            onChange: e => setPass(e.target.value)
          }, void 0, false)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("button", {
          className: "login-btn",
          type: "submit",
          disabled: busy,
          children: busy ? 'Signing in…' : 'Sign in →'
        }, void 0, false), err && /*#__PURE__*/_jsxDEV("p", {
          className: "login-err",
          children: err
        }, void 0, false)]
      }, void 0, true)]
    }, void 0, true)
  }, void 0, false);
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
  if (!rows) return /*#__PURE__*/_jsxDEV("div", {
    className: "loading",
    children: [/*#__PURE__*/_jsxDEV("div", {
      className: "spinner"
    }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
      children: "Loading inquiries…"
    }, void 0, false)]
  }, void 0, true);
  return /*#__PURE__*/_jsxDEV(_Fragment, {
    children: [toast && /*#__PURE__*/_jsxDEV(Toast, {
      msg: toast,
      onDone: () => setToast('')
    }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
      className: "section-hd",
      children: [/*#__PURE__*/_jsxDEV("h2", {
        children: ["Inquiries ", /*#__PURE__*/_jsxDEV("span", {
          style: {
            color: 'var(--ink-3)',
            fontWeight: 400,
            fontSize: 13
          },
          children: ["(", rows.length, ")"]
        }, void 0, true)]
      }, void 0, true), selectedIds.length > 0 && /*#__PURE__*/_jsxDEV("button", {
        className: "btn btn-danger btn-sm",
        disabled: deleting,
        onClick: deleteSelected,
        children: deleting ? 'Deleting…' : `🗑 Delete selected (${selectedIds.length})`
      }, void 0, false)]
    }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
      className: "table-card",
      children: rows.length === 0 ? /*#__PURE__*/_jsxDEV("div", {
        className: "empty",
        children: "No inquiries yet. When someone fills out the brochure form on your website, it will appear here."
      }, void 0, false) : /*#__PURE__*/_jsxDEV("table", {
        className: "gh-table",
        children: [/*#__PURE__*/_jsxDEV("thead", {
          children: /*#__PURE__*/_jsxDEV("tr", {
            children: [/*#__PURE__*/_jsxDEV("th", {
              style: {
                width: 30
              },
              children: /*#__PURE__*/_jsxDEV("input", {
                type: "checkbox",
                checked: rows.length > 0 && selectedIds.length === rows.length,
                onChange: toggleAll
              }, void 0, false)
            }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
              children: "Name"
            }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
              children: "Email"
            }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
              children: "Phone"
            }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
              children: "Interest"
            }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
              children: "Date"
            }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
              children: "Status"
            }, void 0, false), /*#__PURE__*/_jsxDEV("th", {}, void 0, false)]
          }, void 0, true)
        }, void 0, false), /*#__PURE__*/_jsxDEV("tbody", {
          children: rows.map(r => /*#__PURE__*/_jsxDEV("tr", {
            children: [/*#__PURE__*/_jsxDEV("td", {
              children: /*#__PURE__*/_jsxDEV("input", {
                type: "checkbox",
                checked: !!selected[r._id],
                onChange: () => toggleOne(r._id)
              }, void 0, false)
            }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
              children: /*#__PURE__*/_jsxDEV("strong", {
                children: r.fullName || `${r.firstName} ${r.lastName}`
              }, void 0, false)
            }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
              children: /*#__PURE__*/_jsxDEV("a", {
                href: `mailto:${r.email}`,
                style: {
                  color: 'var(--green)'
                },
                children: r.email
              }, void 0, false)
            }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
              children: r.phone
            }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
              style: {
                maxWidth: 160,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              },
              children: r.interest
            }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
              style: {
                color: 'var(--ink-3)'
              },
              children: fmtDate(r.createdAt)
            }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
              children: /*#__PURE__*/_jsxDEV("select", {
                className: "status-sel",
                value: r.status || 'new',
                onChange: e => updateStatus(r._id, e.target.value),
                children: [/*#__PURE__*/_jsxDEV("option", {
                  value: "new",
                  children: "New"
                }, void 0, false), /*#__PURE__*/_jsxDEV("option", {
                  value: "contacted",
                  children: "Contacted"
                }, void 0, false), /*#__PURE__*/_jsxDEV("option", {
                  value: "converted",
                  children: "Converted"
                }, void 0, false), /*#__PURE__*/_jsxDEV("option", {
                  value: "closed",
                  children: "Closed"
                }, void 0, false)]
              }, void 0, true)
            }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
              children: /*#__PURE__*/_jsxDEV("button", {
                className: "btn btn-danger btn-sm",
                onClick: () => deleteOne(r._id, r.fullName || `${r.firstName} ${r.lastName}`),
                children: "Delete"
              }, void 0, false)
            }, void 0, false)]
          }, r._id, true))
        }, void 0, false)]
      }, void 0, true)
    }, void 0, false)]
  }, void 0, true);
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
function Customers({
  currentUser
}) {
  const [rows, setRows] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [toast, setToast] = useState('');
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
  if (!rows) return /*#__PURE__*/_jsxDEV("div", {
    className: "loading",
    children: [/*#__PURE__*/_jsxDEV("div", {
      className: "spinner"
    }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
      children: "Loading customers…"
    }, void 0, false)]
  }, void 0, true);
  const openCustomer = rows.find(r => r._id === openId) || null;
  return /*#__PURE__*/_jsxDEV(_Fragment, {
    children: [toast && /*#__PURE__*/_jsxDEV(Toast, {
      msg: toast,
      onDone: () => setToast('')
    }, void 0, false), showAdd && /*#__PURE__*/_jsxDEV(AddCustomerModal, {
      onClose: () => setShowAdd(false),
      onSaved: () => {
        setShowAdd(false);
        setToast('Customer added');
      }
    }, void 0, false), openCustomer && /*#__PURE__*/_jsxDEV(CustomerDetailModal, {
      customer: openCustomer,
      currentUser: currentUser,
      onClose: () => setOpenId(null),
      onToast: setToast
    }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
      className: "section-hd",
      children: [/*#__PURE__*/_jsxDEV("h2", {
        children: ["Customers / Leads ", /*#__PURE__*/_jsxDEV("span", {
          style: {
            color: 'var(--ink-3)',
            fontWeight: 400,
            fontSize: 13
          },
          children: ["(", rows.length, ")"]
        }, void 0, true)]
      }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
        style: {
          display: 'flex',
          gap: 8
        },
        children: [/*#__PURE__*/_jsxDEV("button", {
          className: "btn btn-outline btn-sm",
          onClick: () => window.print(),
          children: "🖨 Print all"
        }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
          className: "btn btn-primary btn-sm",
          onClick: () => setShowAdd(true),
          children: "+ Add customer"
        }, void 0, false)]
      }, void 0, true)]
    }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
      className: "table-card",
      children: rows.length === 0 ? /*#__PURE__*/_jsxDEV("div", {
        className: "empty",
        children: "No customers yet. Leads from your website form appear here automatically."
      }, void 0, false) : /*#__PURE__*/_jsxDEV("table", {
        className: "gh-table",
        children: [/*#__PURE__*/_jsxDEV("thead", {
          children: /*#__PURE__*/_jsxDEV("tr", {
            children: [/*#__PURE__*/_jsxDEV("th", {
              children: "Name"
            }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
              children: "Contact"
            }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
              children: "Plan"
            }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
              children: "Balance"
            }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
              children: "Revenue"
            }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
              children: "Status"
            }, void 0, false), /*#__PURE__*/_jsxDEV("th", {}, void 0, false)]
          }, void 0, true)
        }, void 0, false), /*#__PURE__*/_jsxDEV("tbody", {
          children: rows.map(r => {
            const bal = planBalance(r);
            return /*#__PURE__*/_jsxDEV("tr", {
              children: [/*#__PURE__*/_jsxDEV("td", {
                children: /*#__PURE__*/_jsxDEV("div", {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer'
                  },
                  onClick: () => setOpenId(r._id),
                  children: [/*#__PURE__*/_jsxDEV("div", {
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
                    },
                    children: initials(r.fullName || `${r.firstName || ''} ${r.lastName || ''}`)
                  }, void 0, false), /*#__PURE__*/_jsxDEV("strong", {
                    children: r.fullName || `${r.firstName} ${r.lastName}`
                  }, void 0, false)]
                }, void 0, true)
              }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                children: [/*#__PURE__*/_jsxDEV("div", {
                  children: /*#__PURE__*/_jsxDEV("a", {
                    href: `mailto:${r.email}`,
                    style: {
                      color: 'var(--green)'
                    },
                    children: r.email
                  }, void 0, false)
                }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                  style: {
                    color: 'var(--ink-3)',
                    fontSize: 12
                  },
                  children: r.phone
                }, void 0, false)]
              }, void 0, true), /*#__PURE__*/_jsxDEV("td", {
                children: r.plan ? /*#__PURE__*/_jsxDEV("span", {
                  className: "plan-badge",
                  children: r.plan.tierName
                }, void 0, false) : r.interestedPlanName ? /*#__PURE__*/_jsxDEV("span", {
                  className: "plan-badge none",
                  title: "Expressed interest on the website — not a formal plan yet",
                  children: ["Interested: ", r.interestedPlanName]
                }, void 0, true) : /*#__PURE__*/_jsxDEV("span", {
                  className: "plan-badge none",
                  children: "No plan yet"
                }, void 0, false)
              }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                children: bal ? /*#__PURE__*/_jsxDEV("div", {
                  style: {
                    minWidth: 110
                  },
                  children: [/*#__PURE__*/_jsxDEV("div", {
                    style: {
                      fontWeight: 700,
                      fontSize: 13
                    },
                    children: fmt(bal.balance)
                  }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                    className: "progress-track",
                    style: {
                      marginTop: 4
                    },
                    children: /*#__PURE__*/_jsxDEV("div", {
                      className: "progress-fill",
                      style: {
                        width: `${bal.pct}%`
                      }
                    }, void 0, false)
                  }, void 0, false)]
                }, void 0, true) : /*#__PURE__*/_jsxDEV("span", {
                  style: {
                    color: 'var(--ink-3)'
                  },
                  children: "—"
                }, void 0, false)
              }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                children: totalPaid(r) > 0 ? /*#__PURE__*/_jsxDEV("div", {
                  style: {
                    fontWeight: 700,
                    fontSize: 13,
                    color: 'var(--green)'
                  },
                  children: fmt(totalPaid(r))
                }, void 0, false) : /*#__PURE__*/_jsxDEV("span", {
                  style: {
                    color: 'var(--ink-3)'
                  },
                  children: "—"
                }, void 0, false)
              }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                children: /*#__PURE__*/_jsxDEV("select", {
                  className: "status-sel",
                  value: normalizeStage(r.status),
                  onChange: e => updateStatus(r._id, e.target.value),
                  children: STAGES.map(s => /*#__PURE__*/_jsxDEV("option", {
                    value: s.id,
                    children: s.label
                  }, s.id, false))
                }, void 0, false)
              }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                children: /*#__PURE__*/_jsxDEV("div", {
                  style: {
                    display: 'flex',
                    gap: 6
                  },
                  children: [/*#__PURE__*/_jsxDEV("button", {
                    className: "btn btn-outline btn-sm",
                    onClick: () => setOpenId(r._id),
                    children: "View"
                  }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
                    className: "btn btn-danger btn-sm",
                    onClick: () => deleteCustomer(r._id, r.fullName),
                    children: "Delete"
                  }, void 0, false)]
                }, void 0, true)
              }, void 0, false)]
            }, r._id, true);
          })
        }, void 0, false)]
      }, void 0, true)
    }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
      className: "print-sheet",
      children: [/*#__PURE__*/_jsxDEV("div", {
        className: "letterhead",
        children: [/*#__PURE__*/_jsxDEV("div", {
          children: [/*#__PURE__*/_jsxDEV("div", {
            className: "brand",
            children: "Golden Harmonic Memorial Park"
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            className: "sub",
            children: "Customer / Leads Summary — Internal Records"
          }, void 0, false)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          className: "sub",
          children: ["Printed: ", new Date().toLocaleString('en-PH')]
        }, void 0, true)]
      }, void 0, true), /*#__PURE__*/_jsxDEV("table", {
        children: [/*#__PURE__*/_jsxDEV("thead", {
          children: /*#__PURE__*/_jsxDEV("tr", {
            children: [/*#__PURE__*/_jsxDEV("th", {
              children: "Name"
            }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
              children: "Email"
            }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
              children: "Phone"
            }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
              children: "Plan"
            }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
              children: "Balance"
            }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
              children: "Status"
            }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
              children: "Follow-up"
            }, void 0, false)]
          }, void 0, true)
        }, void 0, false), /*#__PURE__*/_jsxDEV("tbody", {
          children: rows.map(r => {
            const bal = planBalance(r);
            return /*#__PURE__*/_jsxDEV("tr", {
              children: [/*#__PURE__*/_jsxDEV("td", {
                children: r.fullName || `${r.firstName} ${r.lastName}`
              }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                children: r.email || '—'
              }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                children: r.phone || '—'
              }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                children: r.plan ? r.plan.tierName : r.interestedPlanName || '—'
              }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                children: bal ? fmt(bal.balance) : '—'
              }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                children: STAGE_LABEL[normalizeStage(r.status)]
              }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                children: r.followUpAt || '—'
              }, void 0, false)]
            }, r._id, true);
          })
        }, void 0, false)]
      }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
        className: "footer-note",
        children: ["Total customers/leads on record: ", rows.length]
      }, void 0, true)]
    }, void 0, true)]
  }, void 0, true);
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
  return /*#__PURE__*/_jsxDEV(_Fragment, {
    children: [/*#__PURE__*/_jsxDEV("div", {
      className: "field",
      children: [/*#__PURE__*/_jsxDEV("label", {
        children: "Plot / plan"
      }, void 0, false), /*#__PURE__*/_jsxDEV("select", {
        value: p.tierId,
        onChange: e => e.target.value ? pickTier(e.target.value) : onChange(null),
        children: [/*#__PURE__*/_jsxDEV("option", {
          value: "",
          children: "No plan yet — just a lead"
        }, void 0, false), BASE_TIERS.map(t => /*#__PURE__*/_jsxDEV("option", {
          value: t.id,
          children: [t.name, " — ", fmt(t.price)]
        }, t.id, true))]
      }, void 0, true)]
    }, void 0, true), p.tierId && /*#__PURE__*/_jsxDEV(_Fragment, {
      children: [p.imageUrl && /*#__PURE__*/_jsxDEV("div", {
        style: {
          marginBottom: 12
        },
        children: /*#__PURE__*/_jsxDEV("img", {
          src: p.imageUrl,
          alt: p.tierName,
          style: {
            width: '100%',
            maxHeight: 160,
            objectFit: 'cover',
            borderRadius: 8
          }
        }, void 0, false)
      }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
        style: {
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12
        },
        children: [/*#__PURE__*/_jsxDEV("div", {
          className: "field",
          children: [/*#__PURE__*/_jsxDEV("label", {
            children: "Spot cash price (₱)"
          }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
            type: "number",
            value: p.price,
            onChange: e => set({
              price: e.target.value
            })
          }, void 0, false)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          className: "field",
          children: [/*#__PURE__*/_jsxDEV("label", {
            children: "Start date"
          }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
            type: "date",
            value: p.startDate,
            onChange: e => set({
              startDate: e.target.value
            })
          }, void 0, false)]
        }, void 0, true)]
      }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
        className: "field",
        children: [/*#__PURE__*/_jsxDEV("label", {
          children: "Payment term — no down payment on any plan"
        }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
          style: {
            display: 'flex',
            gap: 6,
            flexWrap: 'wrap'
          },
          children: PLAN_TERMS.map(t => /*#__PURE__*/_jsxDEV("button", {
            type: "button",
            className: `btn btn-sm ${p.termKey === t.key || !p.termKey && t.key === '1yr' ? 'btn-primary' : 'btn-outline'}`,
            onClick: () => set({
              termKey: t.key
            }),
            children: t.label
          }, t.key, false))
        }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
          style: {
            fontSize: 12,
            color: 'var(--ink-3)',
            marginTop: 6
          },
          children: term.key === 'cash' ? `Due in full: ${fmt(p.price)}` : `${fmt(monthly)}/mo for ${term.months} months (total ${fmt(total)}, includes ${Math.round(term.surcharge * 100)}% surcharge)`
        }, void 0, false)]
      }, void 0, true)]
    }, void 0, true)]
  }, void 0, true);
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
  return /*#__PURE__*/_jsxDEV("div", {
    className: "modal-bg",
    onClick: e => e.target === e.currentTarget && onClose(),
    children: /*#__PURE__*/_jsxDEV("div", {
      className: "modal wide",
      children: [/*#__PURE__*/_jsxDEV("h3", {
        children: "Add Customer"
      }, void 0, false), /*#__PURE__*/_jsxDEV("form", {
        onSubmit: save,
        children: [/*#__PURE__*/_jsxDEV("div", {
          className: "modal-scroll",
          children: [/*#__PURE__*/_jsxDEV("div", {
            style: {
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              className: "field",
              children: [/*#__PURE__*/_jsxDEV("label", {
                children: "First name"
              }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
                required: true,
                value: form.firstName,
                onChange: set('firstName'),
                placeholder: "Maria"
              }, void 0, false)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              className: "field",
              children: [/*#__PURE__*/_jsxDEV("label", {
                children: "Last name"
              }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
                required: true,
                value: form.lastName,
                onChange: set('lastName'),
                placeholder: "Santos"
              }, void 0, false)]
            }, void 0, true)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            className: "field",
            children: [/*#__PURE__*/_jsxDEV("label", {
              children: "Email"
            }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
              type: "email",
              required: true,
              value: form.email,
              onChange: set('email'),
              placeholder: "maria@example.com"
            }, void 0, false)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            className: "field",
            children: [/*#__PURE__*/_jsxDEV("label", {
              children: "Phone"
            }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
              value: form.phone,
              onChange: set('phone'),
              placeholder: "+63 917 ..."
            }, void 0, false)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            style: {
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              className: "field",
              children: [/*#__PURE__*/_jsxDEV("label", {
                children: "Location"
              }, void 0, false), /*#__PURE__*/_jsxDEV("select", {
                value: form.preferredLocation,
                onChange: set('preferredLocation'),
                children: [/*#__PURE__*/_jsxDEV("option", {
                  children: "Either park"
                }, void 0, false), /*#__PURE__*/_jsxDEV("option", {
                  children: "Aborlan"
                }, void 0, false), /*#__PURE__*/_jsxDEV("option", {
                  children: "Roxas"
                }, void 0, false)]
              }, void 0, true)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              className: "field",
              children: [/*#__PURE__*/_jsxDEV("label", {
                children: "Status"
              }, void 0, false), /*#__PURE__*/_jsxDEV("select", {
                value: form.status,
                onChange: set('status'),
                children: [/*#__PURE__*/_jsxDEV("option", {
                  value: "lead",
                  children: "Lead"
                }, void 0, false), /*#__PURE__*/_jsxDEV("option", {
                  value: "active",
                  children: "Active"
                }, void 0, false), /*#__PURE__*/_jsxDEV("option", {
                  value: "converted",
                  children: "Converted"
                }, void 0, false)]
              }, void 0, true)]
            }, void 0, true)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            className: "field",
            children: [/*#__PURE__*/_jsxDEV("label", {
              children: "Interest"
            }, void 0, false), /*#__PURE__*/_jsxDEV("select", {
              value: form.interest,
              onChange: set('interest'),
              children: [/*#__PURE__*/_jsxDEV("option", {
                children: "Pre-need (planning ahead)"
              }, void 0, false), /*#__PURE__*/_jsxDEV("option", {
                children: "At-need (immediate)"
              }, void 0, false), /*#__PURE__*/_jsxDEV("option", {
                children: "Investment / resale"
              }, void 0, false), /*#__PURE__*/_jsxDEV("option", {
                children: "Just exploring"
              }, void 0, false)]
            }, void 0, true)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("hr", {
            style: {
              border: 'none',
              borderTop: '1px solid var(--border)',
              margin: '18px 0'
            }
          }, void 0, false), /*#__PURE__*/_jsxDEV(PlanFields, {
            plan: plan,
            onChange: setPlan
          }, void 0, false)]
        }, void 0, true), err && /*#__PURE__*/_jsxDEV("p", {
          className: "err-msg",
          children: err
        }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
          className: "modal-actions",
          children: [/*#__PURE__*/_jsxDEV("button", {
            type: "button",
            className: "btn btn-outline",
            onClick: onClose,
            children: "Cancel"
          }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
            type: "submit",
            className: "btn btn-primary",
            disabled: busy,
            children: busy ? 'Saving…' : 'Save customer'
          }, void 0, false)]
        }, void 0, true)]
      }, void 0, true)]
    }, void 0, true)
  }, void 0, false);
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
  return /*#__PURE__*/_jsxDEV("canvas", {
    ref: ref
  }, void 0, false);
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
  return /*#__PURE__*/_jsxDEV(_Fragment, {
    children: [/*#__PURE__*/_jsxDEV("canvas", {
      ref: ref
    }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
      className: "donut-legend",
      children: STAGES.map((s, i) => /*#__PURE__*/_jsxDEV("div", {
        className: "donut-legend-item",
        children: [/*#__PURE__*/_jsxDEV("span", {
          className: "donut-dot",
          style: {
            background: colors[i]
          }
        }, void 0, false), s.label, " — ", counts[i]]
      }, s.id, true))
    }, void 0, false)]
  }, void 0, true);
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
  if (!rows) return /*#__PURE__*/_jsxDEV("div", {
    className: "loading",
    children: [/*#__PURE__*/_jsxDEV("div", {
      className: "spinner"
    }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
      children: "Loading pipeline…"
    }, void 0, false)]
  }, void 0, true);
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
  return /*#__PURE__*/_jsxDEV("div", {
    children: [/*#__PURE__*/_jsxDEV("div", {
      className: "section-hd",
      children: /*#__PURE__*/_jsxDEV("h2", {
        children: ["Pipeline ", /*#__PURE__*/_jsxDEV("span", {
          style: {
            color: 'var(--ink-3)',
            fontWeight: 400,
            fontSize: 13
          },
          children: ["(", rows.length, ")"]
        }, void 0, true)]
      }, void 0, true)
    }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
      className: "charts-row",
      children: [/*#__PURE__*/_jsxDEV("div", {
        className: "chart-card",
        children: [/*#__PURE__*/_jsxDEV("h3", {
          children: "Inquiries — last 6 months"
        }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
          style: {
            height: 220
          },
          children: /*#__PURE__*/_jsxDEV(InquiriesBarChart, {
            inquiries: inquiries
          }, void 0, false)
        }, void 0, false)]
      }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
        className: "chart-card",
        children: [/*#__PURE__*/_jsxDEV("h3", {
          children: "Pipeline breakdown"
        }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
          style: {
            height: 150
          },
          children: /*#__PURE__*/_jsxDEV(PipelineDonutChart, {
            customers: rows
          }, void 0, false)
        }, void 0, false)]
      }, void 0, true)]
    }, void 0, true), dueList.length > 0 && /*#__PURE__*/_jsxDEV("div", {
      style: {
        background: '#fff8e1',
        border: '1px solid #ffe082',
        borderRadius: 8,
        padding: '10px 14px',
        marginBottom: 16,
        fontSize: 13
      },
      children: [/*#__PURE__*/_jsxDEV("strong", {
        children: ["⏰ ", dueList.length, " follow-up", dueList.length > 1 ? 's' : '', " due:"]
      }, void 0, true), ' ', dueList.map((r, i) => /*#__PURE__*/_jsxDEV("span", {
        children: [/*#__PURE__*/_jsxDEV("a", {
          href: "#",
          onClick: e => {
            e.preventDefault();
            setOpenId(r._id);
          },
          style: {
            color: isOverdue(r.followUpAt) ? '#c0392b' : '#8a6d3b',
            fontWeight: 600
          },
          children: r.fullName || r.firstName
        }, void 0, false), i < dueList.length - 1 ? ', ' : '']
      }, r._id, true))]
    }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
      className: "kanban-board",
      children: STAGES.map(stage => /*#__PURE__*/_jsxDEV("div", {
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
        },
        children: [/*#__PURE__*/_jsxDEV("div", {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 10,
            padding: '0 4px'
          },
          children: [/*#__PURE__*/_jsxDEV("strong", {
            style: {
              fontSize: 13
            },
            children: stage.label
          }, void 0, false), /*#__PURE__*/_jsxDEV("span", {
            style: {
              fontSize: 11,
              color: 'var(--ink-3)',
              background: '#fff',
              borderRadius: 10,
              padding: '1px 8px'
            },
            children: byStage[stage.id].length
          }, void 0, false)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          style: {
            display: 'flex',
            flexDirection: 'column',
            gap: 8
          },
          children: [byStage[stage.id].map(c => /*#__PURE__*/_jsxDEV("div", {
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
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              className: "kanban-card-name",
              style: {
                fontWeight: 700,
                marginBottom: 2
              },
              children: c.fullName || `${c.firstName} ${c.lastName}`
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              className: "kanban-card-name",
              style: {
                color: 'var(--ink-3)',
                fontSize: 11.5
              },
              children: c.interest || '—'
            }, void 0, false), c.followUpAt && /*#__PURE__*/_jsxDEV("div", {
              style: {
                marginTop: 6,
                fontSize: 11,
                fontWeight: 600,
                color: isOverdue(c.followUpAt) ? '#c0392b' : isDueToday(c.followUpAt) ? '#b7791f' : 'var(--ink-3)'
              },
              children: [isOverdue(c.followUpAt) ? '🔴' : isDueToday(c.followUpAt) ? '🟡' : '📅', " ", c.followUpAt]
            }, void 0, true), totalPaid(c) > 0 && /*#__PURE__*/_jsxDEV("div", {
              style: {
                marginTop: 4,
                fontSize: 11.5,
                color: 'var(--green,#3f7a5c)',
                fontWeight: 700
              },
              children: fmt(totalPaid(c))
            }, void 0, false)]
          }, c._id, true)), byStage[stage.id].length === 0 && /*#__PURE__*/_jsxDEV("div", {
            style: {
              fontSize: 11.5,
              color: 'var(--ink-3)',
              textAlign: 'center',
              padding: '16px 4px'
            },
            children: "Drop a card here"
          }, void 0, false)]
        }, void 0, true)]
      }, stage.id, true))
    }, void 0, false), openCustomer && /*#__PURE__*/_jsxDEV(CustomerDetailModal, {
      customer: openCustomer,
      currentUser: currentUser,
      onClose: () => setOpenId(null),
      onToast: setToast
    }, void 0, false), toast && /*#__PURE__*/_jsxDEV("div", {
      className: "toast",
      children: toast
    }, void 0, false)]
  }, void 0, true);
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
  return /*#__PURE__*/_jsxDEV("div", {
    className: "modal-bg",
    onClick: e => e.target === e.currentTarget && onClose(),
    children: [/*#__PURE__*/_jsxDEV("div", {
      className: "modal wide",
      children: [/*#__PURE__*/_jsxDEV("h3", {
        children: [customer.fullName || `${customer.firstName} ${customer.lastName}`, /*#__PURE__*/_jsxDEV("span", {
          style: {
            fontWeight: 400,
            fontSize: 13,
            color: 'var(--ink-3)',
            marginLeft: 8
          },
          children: customer.email
        }, void 0, false)]
      }, void 0, true), customer.plan ? /*#__PURE__*/_jsxDEV("div", {
        className: "plan-summary",
        style: customer.plan.imageUrl ? {
          gridTemplateColumns: '96px 1fr 1fr 1fr'
        } : undefined,
        children: [customer.plan.imageUrl && /*#__PURE__*/_jsxDEV("div", {
          style: {
            gridRow: '1 / 3'
          },
          children: /*#__PURE__*/_jsxDEV("img", {
            src: customer.plan.imageUrl,
            alt: customer.plan.tierName,
            style: {
              width: 96,
              height: 96,
              objectFit: 'cover',
              borderRadius: 8
            }
          }, void 0, false)
        }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
          children: [/*#__PURE__*/_jsxDEV("div", {
            className: "lbl",
            children: "Plan"
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            className: "val",
            style: {
              fontSize: 14
            },
            children: customer.plan.tierName
          }, void 0, false)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          children: [/*#__PURE__*/_jsxDEV("div", {
            className: "lbl",
            children: "Monthly"
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            className: "val",
            style: {
              fontSize: 14
            },
            children: [fmt(customer.plan.monthlyAmount), "/mo"]
          }, void 0, true)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          children: [/*#__PURE__*/_jsxDEV("div", {
            className: "lbl",
            children: "Balance"
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            className: "val",
            style: {
              fontSize: 14
            },
            children: fmt(bal.balance)
          }, void 0, false)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          style: {
            gridColumn: customer.plan.imageUrl ? '2 / -1' : '1 / -1'
          },
          children: [/*#__PURE__*/_jsxDEV("div", {
            className: "progress-track",
            children: /*#__PURE__*/_jsxDEV("div", {
              className: "progress-fill",
              style: {
                width: `${bal.pct}%`
              }
            }, void 0, false)
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            style: {
              fontSize: 12,
              color: 'var(--ink-3)',
              marginTop: 4
            },
            children: [fmt(bal.paid), " paid of ", fmt(bal.price), " (", Math.round(bal.pct), "%)"]
          }, void 0, true)]
        }, void 0, true)]
      }, void 0, true) : /*#__PURE__*/_jsxDEV("div", {
        className: "plan-summary",
        style: {
          gridTemplateColumns: '1fr'
        },
        children: /*#__PURE__*/_jsxDEV("div", {
          style: {
            color: 'var(--ink-3)'
          },
          children: "No plan selected yet for this customer."
        }, void 0, false)
      }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
        className: "plan-summary",
        style: {
          gridTemplateColumns: '1fr auto',
          alignItems: 'center',
          marginTop: customer.plan ? 10 : 0
        },
        children: [/*#__PURE__*/_jsxDEV("div", {
          children: [/*#__PURE__*/_jsxDEV("div", {
            className: "lbl",
            children: "Portal access"
          }, void 0, false), customer.authUid ? /*#__PURE__*/_jsxDEV("div", {
            className: "val",
            style: {
              fontSize: 13,
              color: 'var(--green)'
            },
            children: ["✅ Active — customer can log in with ", customer.email, " to view their balance"]
          }, void 0, true) : /*#__PURE__*/_jsxDEV("div", {
            className: "val",
            style: {
              fontSize: 13,
              color: 'var(--ink-3)'
            },
            children: "No login created yet"
          }, void 0, false), portalError && /*#__PURE__*/_jsxDEV("div", {
            style: {
              fontSize: 12,
              color: 'var(--red)',
              marginTop: 4
            },
            children: portalError
          }, void 0, false), !customer.authUid && /*#__PURE__*/_jsxDEV("div", {
            style: {
              marginTop: 6
            },
            children: [/*#__PURE__*/_jsxDEV("button", {
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
              },
              children: showManualLink ? 'Hide manual link' : 'Already have a Firebase Auth account for this email? Link it manually'
            }, void 0, false), showManualLink && /*#__PURE__*/_jsxDEV("div", {
              style: {
                marginTop: 8,
                display: 'flex',
                gap: 6,
                alignItems: 'flex-start',
                flexWrap: 'wrap'
              },
              children: [/*#__PURE__*/_jsxDEV("div", {
                children: [/*#__PURE__*/_jsxDEV("input", {
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
                }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                  style: {
                    fontSize: 11,
                    color: 'var(--ink-3)',
                    marginTop: 4,
                    maxWidth: 260
                  },
                  children: ["Find it in Firebase console → Authentication → Users tab, search by ", customer.email || 'this customer\'s email', ", copy the User UID column."]
                }, void 0, true)]
              }, void 0, true), /*#__PURE__*/_jsxDEV("button", {
                className: "btn btn-outline btn-sm",
                disabled: portalBusy,
                onClick: handleManualLink,
                children: portalBusy ? 'Linking…' : 'Link account'
              }, void 0, false)]
            }, void 0, true)]
          }, void 0, true)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          children: customer.authUid ? /*#__PURE__*/_jsxDEV("button", {
            className: "btn btn-outline btn-sm",
            disabled: portalBusy,
            onClick: resendPortalReset,
            children: portalBusy ? 'Sending…' : 'Resend password-setup email'
          }, void 0, false) : /*#__PURE__*/_jsxDEV("button", {
            className: "btn btn-primary btn-sm",
            disabled: portalBusy,
            onClick: handleCreatePortal,
            children: portalBusy ? 'Creating…' : 'Create portal login'
          }, void 0, false)
        }, void 0, false)]
      }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
        className: "detail-tabs",
        children: [/*#__PURE__*/_jsxDEV("button", {
          className: tab === 'payments' ? 'on' : '',
          onClick: () => setTab('payments'),
          children: "Payments"
        }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
          className: tab === 'plan' ? 'on' : '',
          onClick: () => {
            setTab('plan');
            setEditingPlan(true);
          },
          children: customer.plan ? 'Edit plan' : 'Set a plan'
        }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
          className: tab === 'activity' ? 'on' : '',
          onClick: () => setTab('activity'),
          children: ["Activity", customer.followUpAt && isOverdue(customer.followUpAt) ? ' 🔴' : '']
        }, void 0, true)]
      }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
        className: "modal-scroll",
        children: [tab === 'payments' && /*#__PURE__*/_jsxDEV(_Fragment, {
          children: [customer.plan ? /*#__PURE__*/_jsxDEV("form", {
            onSubmit: logPayment,
            style: {
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr auto',
              gap: 8,
              alignItems: 'end',
              marginBottom: 6
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              className: "field",
              style: {
                margin: 0
              },
              children: [/*#__PURE__*/_jsxDEV("label", {
                children: "Date"
              }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
                type: "date",
                value: pay.date,
                onChange: e => setPay(p => ({
                  ...p,
                  date: e.target.value
                }))
              }, void 0, false)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              className: "field",
              style: {
                margin: 0
              },
              children: [/*#__PURE__*/_jsxDEV("label", {
                children: "Amount (₱)"
              }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
                type: "number",
                required: true,
                value: pay.amount,
                onChange: e => setPay(p => ({
                  ...p,
                  amount: e.target.value
                })),
                placeholder: "3188"
              }, void 0, false)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              className: "field",
              style: {
                margin: 0
              },
              children: [/*#__PURE__*/_jsxDEV("label", {
                children: "Method"
              }, void 0, false), /*#__PURE__*/_jsxDEV("select", {
                value: pay.method,
                onChange: e => setPay(p => ({
                  ...p,
                  method: e.target.value
                })),
                children: [/*#__PURE__*/_jsxDEV("option", {
                  children: "Cash"
                }, void 0, false), /*#__PURE__*/_jsxDEV("option", {
                  children: "Bank transfer"
                }, void 0, false), /*#__PURE__*/_jsxDEV("option", {
                  children: "GCash"
                }, void 0, false), /*#__PURE__*/_jsxDEV("option", {
                  children: "Check"
                }, void 0, false)]
              }, void 0, true)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("button", {
              className: "btn btn-primary btn-sm",
              disabled: busy,
              children: busy ? 'Logging…' : '+ Log payment'
            }, void 0, false)]
          }, void 0, true) : /*#__PURE__*/_jsxDEV("div", {
            className: "empty",
            children: "Set a plan first, then payments can be logged against it."
          }, void 0, false), payments.length > 0 && /*#__PURE__*/_jsxDEV("table", {
            className: "pay-table",
            children: [/*#__PURE__*/_jsxDEV("thead", {
              children: /*#__PURE__*/_jsxDEV("tr", {
                children: [/*#__PURE__*/_jsxDEV("th", {
                  children: "Date"
                }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
                  children: "Amount"
                }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
                  children: "Method"
                }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
                  children: "Note"
                }, void 0, false)]
              }, void 0, true)
            }, void 0, false), /*#__PURE__*/_jsxDEV("tbody", {
              children: payments.map((p, i) => /*#__PURE__*/_jsxDEV("tr", {
                children: [/*#__PURE__*/_jsxDEV("td", {
                  children: p.date
                }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                  children: fmt(p.amount)
                }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                  children: p.method
                }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                  children: p.note
                }, void 0, false)]
              }, i, true))
            }, void 0, false)]
          }, void 0, true)]
        }, void 0, true), tab === 'plan' && /*#__PURE__*/_jsxDEV(_Fragment, {
          children: [/*#__PURE__*/_jsxDEV(PlanFields, {
            plan: plan,
            onChange: setPlan
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            className: "modal-actions",
            children: /*#__PURE__*/_jsxDEV("button", {
              className: "btn btn-primary btn-sm",
              disabled: savingPlan,
              onClick: savePlan,
              children: savingPlan ? 'Saving…' : 'Save plan'
            }, void 0, false)
          }, void 0, false)]
        }, void 0, true), tab === 'activity' && /*#__PURE__*/_jsxDEV(_Fragment, {
          children: [/*#__PURE__*/_jsxDEV("div", {
            style: {
              display: 'grid',
              gridTemplateColumns: '1fr 2fr auto',
              gap: 8,
              alignItems: 'end',
              padding: 12,
              background: 'var(--card-2, #f7f4ec)',
              borderRadius: 8,
              marginBottom: 16
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              className: "field",
              style: {
                margin: 0
              },
              children: [/*#__PURE__*/_jsxDEV("label", {
                children: "Follow-up date"
              }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
                type: "date",
                value: followUp.date,
                onChange: e => setFollowUp(f => ({
                  ...f,
                  date: e.target.value
                }))
              }, void 0, false)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              className: "field",
              style: {
                margin: 0
              },
              children: [/*#__PURE__*/_jsxDEV("label", {
                children: "Reminder note"
              }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
                type: "text",
                placeholder: "e.g. Call about site visit",
                value: followUp.note,
                onChange: e => setFollowUp(f => ({
                  ...f,
                  note: e.target.value
                }))
              }, void 0, false)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("button", {
              className: "btn btn-primary btn-sm",
              disabled: savingFollowUp,
              onClick: saveFollowUp,
              children: savingFollowUp ? 'Saving…' : 'Save'
            }, void 0, false), customer.followUpAt && /*#__PURE__*/_jsxDEV("div", {
              style: {
                gridColumn: '1 / -1',
                fontSize: 12,
                color: isOverdue(customer.followUpAt) ? '#c0392b' : isDueToday(customer.followUpAt) ? '#b7791f' : 'var(--ink-3)'
              },
              children: [isOverdue(customer.followUpAt) ? '🔴 Overdue' : isDueToday(customer.followUpAt) ? '🟡 Due today' : '📅 Upcoming', ' — ', customer.followUpAt, customer.followUpNote ? `: ${customer.followUpNote}` : '']
            }, void 0, true)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            style: {
              display: 'flex',
              gap: 8,
              marginBottom: 16
            },
            children: [/*#__PURE__*/_jsxDEV("input", {
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
            }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
              className: "btn btn-primary btn-sm",
              disabled: addingNote || !noteText.trim(),
              onClick: addNote,
              children: addingNote ? 'Adding…' : '+ Add note'
            }, void 0, false)]
          }, void 0, true), activity.length === 0 ? /*#__PURE__*/_jsxDEV("div", {
            className: "empty",
            children: "No activity yet — notes, stage changes, and payments will show up here."
          }, void 0, false) : /*#__PURE__*/_jsxDEV("div", {
            style: {
              display: 'flex',
              flexDirection: 'column',
              gap: 10
            },
            children: activity.map((a, i) => /*#__PURE__*/_jsxDEV("div", {
              style: {
                display: 'flex',
                gap: 10,
                fontSize: 13,
                paddingBottom: 10,
                borderBottom: i < activity.length - 1 ? '1px solid var(--border,#eee)' : 'none'
              },
              children: [/*#__PURE__*/_jsxDEV("div", {
                style: {
                  flexShrink: 0,
                  width: 20,
                  textAlign: 'center'
                },
                children: a.kind === 'payment' ? '💵' : a.kind === 'system' ? '↻' : '📝'
              }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                style: {
                  flex: 1
                },
                children: [/*#__PURE__*/_jsxDEV("div", {
                  children: a.text
                }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                  style: {
                    color: 'var(--ink-3)',
                    fontSize: 11,
                    marginTop: 2
                  },
                  children: [a.author ? `${a.author} · ` : '', a.at ? new Date(a.at).toLocaleString('en-PH') : '']
                }, void 0, true)]
              }, void 0, true)]
            }, i, true))
          }, void 0, false)]
        }, void 0, true)]
      }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
        className: "modal-actions",
        children: [/*#__PURE__*/_jsxDEV("button", {
          type: "button",
          className: "btn btn-outline",
          onClick: () => window.print(),
          children: "🖨 Print record"
        }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
          type: "button",
          className: "btn btn-outline",
          onClick: onClose,
          children: "Close"
        }, void 0, false)]
      }, void 0, true)]
    }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
      className: "print-sheet",
      children: [/*#__PURE__*/_jsxDEV("div", {
        className: "letterhead",
        children: [/*#__PURE__*/_jsxDEV("div", {
          children: [/*#__PURE__*/_jsxDEV("div", {
            className: "brand",
            children: "Golden Harmonic Memorial Park"
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            className: "sub",
            children: "Customer Record — Internal Records"
          }, void 0, false)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          className: "sub",
          children: ["Printed: ", new Date().toLocaleString('en-PH')]
        }, void 0, true)]
      }, void 0, true), /*#__PURE__*/_jsxDEV("h2", {
        children: "Customer Information"
      }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
        className: "meta-grid",
        children: [/*#__PURE__*/_jsxDEV("div", {
          children: [/*#__PURE__*/_jsxDEV("span", {
            children: "Name: "
          }, void 0, false), /*#__PURE__*/_jsxDEV("strong", {
            children: customer.fullName || `${customer.firstName} ${customer.lastName}`
          }, void 0, false)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          children: [/*#__PURE__*/_jsxDEV("span", {
            children: "Pipeline stage: "
          }, void 0, false), /*#__PURE__*/_jsxDEV("strong", {
            children: STAGE_LABEL[normalizeStage(customer.status)]
          }, void 0, false)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          children: [/*#__PURE__*/_jsxDEV("span", {
            children: "Email: "
          }, void 0, false), customer.email || '—']
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          children: [/*#__PURE__*/_jsxDEV("span", {
            children: "Phone: "
          }, void 0, false), customer.phone || '—']
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          children: [/*#__PURE__*/_jsxDEV("span", {
            children: "Preferred location: "
          }, void 0, false), customer.preferredLocation || '—']
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          children: [/*#__PURE__*/_jsxDEV("span", {
            children: "Interest: "
          }, void 0, false), customer.interest || '—']
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          children: [/*#__PURE__*/_jsxDEV("span", {
            children: "Lead source: "
          }, void 0, false), customer.source || '—']
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          children: [/*#__PURE__*/_jsxDEV("span", {
            children: "Date added: "
          }, void 0, false), customer.createdAt && customer.createdAt.toDate ? customer.createdAt.toDate().toLocaleDateString('en-PH') : customer.createdAt ? new Date(customer.createdAt).toLocaleDateString('en-PH') : '—']
        }, void 0, true)]
      }, void 0, true), customer.plan && /*#__PURE__*/_jsxDEV(_Fragment, {
        children: [/*#__PURE__*/_jsxDEV("h2", {
          children: "Plan Details"
        }, void 0, false), customer.plan.imageUrl && /*#__PURE__*/_jsxDEV("img", {
          src: customer.plan.imageUrl,
          alt: customer.plan.tierName,
          style: {
            width: '100%',
            maxHeight: 220,
            objectFit: 'cover',
            borderRadius: 6,
            marginBottom: 10
          }
        }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
          className: "meta-grid",
          children: [/*#__PURE__*/_jsxDEV("div", {
            children: [/*#__PURE__*/_jsxDEV("span", {
              children: "Plan: "
            }, void 0, false), /*#__PURE__*/_jsxDEV("strong", {
              children: customer.plan.tierName
            }, void 0, false)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            children: [/*#__PURE__*/_jsxDEV("span", {
              children: "Term: "
            }, void 0, false), customer.plan.termLabel || '—']
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            children: [/*#__PURE__*/_jsxDEV("span", {
              children: "Plan price: "
            }, void 0, false), fmt(customer.plan.price)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            children: [/*#__PURE__*/_jsxDEV("span", {
              children: "Monthly amount: "
            }, void 0, false), fmt(customer.plan.monthlyAmount), "/mo"]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            children: [/*#__PURE__*/_jsxDEV("span", {
              children: "Total paid to date: "
            }, void 0, false), fmt(bal.paid)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            children: [/*#__PURE__*/_jsxDEV("span", {
              children: "Remaining balance: "
            }, void 0, false), fmt(bal.balance)]
          }, void 0, true)]
        }, void 0, true)]
      }, void 0, true), payments.length > 0 && /*#__PURE__*/_jsxDEV(_Fragment, {
        children: [/*#__PURE__*/_jsxDEV("h2", {
          children: "Payment History"
        }, void 0, false), /*#__PURE__*/_jsxDEV("table", {
          children: [/*#__PURE__*/_jsxDEV("thead", {
            children: /*#__PURE__*/_jsxDEV("tr", {
              children: [/*#__PURE__*/_jsxDEV("th", {
                children: "Date"
              }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
                children: "Amount"
              }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
                children: "Method"
              }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
                children: "Note"
              }, void 0, false)]
            }, void 0, true)
          }, void 0, false), /*#__PURE__*/_jsxDEV("tbody", {
            children: payments.map((p, i) => /*#__PURE__*/_jsxDEV("tr", {
              children: [/*#__PURE__*/_jsxDEV("td", {
                children: p.date
              }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                children: fmt(p.amount)
              }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                children: p.method
              }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                children: p.note || '—'
              }, void 0, false)]
            }, i, true))
          }, void 0, false)]
        }, void 0, true)]
      }, void 0, true), customer.followUpAt && /*#__PURE__*/_jsxDEV(_Fragment, {
        children: [/*#__PURE__*/_jsxDEV("h2", {
          children: "Follow-up"
        }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
          className: "meta-grid",
          children: [/*#__PURE__*/_jsxDEV("div", {
            children: [/*#__PURE__*/_jsxDEV("span", {
              children: "Date: "
            }, void 0, false), customer.followUpAt]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            children: [/*#__PURE__*/_jsxDEV("span", {
              children: "Note: "
            }, void 0, false), customer.followUpNote || '—']
          }, void 0, true)]
        }, void 0, true)]
      }, void 0, true), /*#__PURE__*/_jsxDEV("h2", {
        children: "Activity & Notes"
      }, void 0, false), activity.length === 0 ? /*#__PURE__*/_jsxDEV("div", {
        className: "activity-item",
        children: "No activity recorded."
      }, void 0, false) : activity.map((a, i) => /*#__PURE__*/_jsxDEV("div", {
        className: "activity-item",
        children: [/*#__PURE__*/_jsxDEV("strong", {
          children: a.at ? new Date(a.at).toLocaleString('en-PH') : '—'
        }, void 0, false), " — ", a.text, a.author ? ` (${a.author})` : '']
      }, i, true)), /*#__PURE__*/_jsxDEV("div", {
        className: "footer-note",
        children: "This record was generated from the Golden Harmonic Memorial Park CRM for internal filing purposes."
      }, void 0, false)]
    }, void 0, true)]
  }, void 0, true);
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
  if (!products) return /*#__PURE__*/_jsxDEV("div", {
    className: "loading",
    children: [/*#__PURE__*/_jsxDEV("div", {
      className: "spinner"
    }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
      children: "Loading products…"
    }, void 0, false)]
  }, void 0, true);
  return /*#__PURE__*/_jsxDEV(_Fragment, {
    children: [toast && /*#__PURE__*/_jsxDEV(Toast, {
      msg: toast,
      onDone: () => setToast('')
    }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
      className: "section-hd",
      children: [/*#__PURE__*/_jsxDEV("h2", {
        children: "Products & Pricing"
      }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
        className: "btn btn-outline btn-sm",
        onClick: seedProducts,
        children: products.length === 0 ? '⬆ Seed default products' : '↺ Reset to defaults'
      }, void 0, false)]
    }, void 0, true), products.length === 0 ? /*#__PURE__*/_jsxDEV("div", {
      className: "table-card",
      children: /*#__PURE__*/_jsxDEV("div", {
        className: "empty",
        children: ["No products in database yet.", /*#__PURE__*/_jsxDEV("br", {}, void 0, false), "Click \"Seed default products\" to push your 7 standard plot types to Firestore.", /*#__PURE__*/_jsxDEV("br", {}, void 0, false), "After seeding, price changes here will reflect live on your website."]
      }, void 0, true)
    }, void 0, false) : /*#__PURE__*/_jsxDEV("div", {
      className: "products-grid",
      children: products.map(p => {
        const ed = local[p._id] || {
          price: p.price
        };
        const price = Number(ed.price) || 0;
        return /*#__PURE__*/_jsxDEV("div", {
          className: "product-card",
          children: [/*#__PURE__*/_jsxDEV("div", {
            style: {
              fontSize: 11,
              color: 'var(--ink-3)',
              textTransform: 'uppercase',
              letterSpacing: '.04em',
              marginBottom: 2
            },
            children: p.category
          }, void 0, false), /*#__PURE__*/_jsxDEV("h3", {
            children: p.name
          }, void 0, false), /*#__PURE__*/_jsxDEV("p", {
            className: "product-desc",
            children: p.desc
          }, void 0, false), ed.imageUrl && /*#__PURE__*/_jsxDEV("img", {
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
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            className: "price-edit",
            children: [/*#__PURE__*/_jsxDEV("label", {
              children: "Photo URL"
            }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
              type: "text",
              value: ed.imageUrl || '',
              placeholder: "https://…",
              onChange: e => setVal(p._id, 'imageUrl', e.target.value)
            }, void 0, false)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            className: "price-edit",
            children: [/*#__PURE__*/_jsxDEV("label", {
              children: "Spot cash price (₱)"
            }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
              type: "number",
              value: ed.price,
              onChange: e => setVal(p._id, 'price', e.target.value)
            }, void 0, false)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            style: {
              fontSize: 12,
              color: 'var(--ink-3)',
              margin: '10px 0',
              lineHeight: 1.6
            },
            children: ["No down payment — surcharge + term applies:", /*#__PURE__*/_jsxDEV("br", {}, void 0, false), PLAN_TERMS.slice(1).map(t => /*#__PURE__*/_jsxDEV("span", {
              style: {
                display: 'inline-block',
                marginRight: 12
              },
              children: [t.label.replace(' Plan', ''), ": ", fmt(Math.round(price * (1 + t.surcharge) / t.months)), "/mo"]
            }, t.key, true))]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginTop: 12
            },
            children: [/*#__PURE__*/_jsxDEV("button", {
              className: "btn btn-primary btn-sm",
              disabled: saving[p._id],
              onClick: () => saveProduct(p),
              children: saving[p._id] ? 'Saving…' : 'Save'
            }, void 0, false), /*#__PURE__*/_jsxDEV("span", {
              className: "save-indicator",
              children: saved[p._id] && /*#__PURE__*/_jsxDEV("span", {
                className: "save-ok",
                children: "✓ Saved"
              }, void 0, false)
            }, void 0, false)]
          }, void 0, true)]
        }, p._id, true);
      })
    }, void 0, false)]
  }, void 0, true);
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
  return /*#__PURE__*/_jsxDEV(_Fragment, {
    children: [toast && /*#__PURE__*/_jsxDEV(Toast, {
      msg: toast,
      onDone: () => setToast('')
    }, void 0, false), showAdd && /*#__PURE__*/_jsxDEV(AddUserModal, {
      currentRole: currentRole,
      onClose: () => setShowAdd(false),
      onSaved: () => {
        setShowAdd(false);
        setToast('User record added');
      }
    }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
      className: "section-hd",
      children: [/*#__PURE__*/_jsxDEV("h2", {
        children: "Admin Users"
      }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
        className: "btn btn-primary btn-sm",
        onClick: () => setShowAdd(true),
        children: "+ Add user"
      }, void 0, false)]
    }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
      style: {
        background: '#fff8e1',
        border: '1px solid #ffe082',
        borderRadius: 8,
        padding: '12px 16px',
        fontSize: 13,
        color: '#795548',
        marginBottom: 16
      },
      children: ["💡 First create the real login in ", /*#__PURE__*/_jsxDEV("strong", {
        children: "Firebase Console → Authentication → Add user"
      }, void 0, false), ", then copy that user's ", /*#__PURE__*/_jsxDEV("strong", {
        children: "UID"
      }, void 0, false), " and paste it below. The role only takes effect — both here and in Firestore security rules — when this record's ID matches their Auth UID.", !isSuperAdmin && /*#__PURE__*/_jsxDEV(_Fragment, {
        children: [/*#__PURE__*/_jsxDEV("br", {}, void 0, false), "🔒 As an Admin, you can manage Staff and Admin accounts. Super Admin accounts are visible but locked to you."]
      }, void 0, true)]
    }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
      className: "users-grid",
      children: [users.length === 0 && /*#__PURE__*/_jsxDEV("div", {
        className: "table-card",
        children: /*#__PURE__*/_jsxDEV("div", {
          className: "empty",
          children: "No users recorded yet. Add your admin accounts above."
        }, void 0, false)
      }, void 0, false), users.map(u => {
        const locked = u.role === 'superadmin' && !isSuperAdmin;
        return /*#__PURE__*/_jsxDEV("div", {
          className: "user-row",
          children: [/*#__PURE__*/_jsxDEV("div", {
            className: "user-info",
            children: [/*#__PURE__*/_jsxDEV("div", {
              className: "user-avatar",
              children: initials(u.name || u.email)
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              children: [/*#__PURE__*/_jsxDEV("div", {
                className: "user-name",
                children: u.name || '(no name)'
              }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                className: "user-email",
                children: [u.email, " · ", /*#__PURE__*/_jsxDEV("em", {
                  children: u.role || 'admin'
                }, void 0, false)]
              }, void 0, true)]
            }, void 0, true)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("button", {
            className: "btn btn-danger btn-sm",
            disabled: locked,
            title: locked ? 'Only a Super Admin can remove this account' : '',
            onClick: () => removeUser(u._id, u.email, u.role),
            children: "Remove"
          }, void 0, false)]
        }, u._id, true);
      })]
    }, void 0, true)]
  }, void 0, true);
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
  return /*#__PURE__*/_jsxDEV("div", {
    className: "modal-bg",
    onClick: e => e.target === e.currentTarget && onClose(),
    children: /*#__PURE__*/_jsxDEV("div", {
      className: "modal",
      children: [/*#__PURE__*/_jsxDEV("h3", {
        children: "Add Admin User"
      }, void 0, false), /*#__PURE__*/_jsxDEV("form", {
        onSubmit: save,
        children: [/*#__PURE__*/_jsxDEV("div", {
          className: "field",
          children: [/*#__PURE__*/_jsxDEV("label", {
            children: "Firebase Auth UID"
          }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
            required: true,
            value: form.uid,
            onChange: set('uid'),
            placeholder: "Copy from Firebase Console → Authentication"
          }, void 0, false)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          className: "field",
          children: [/*#__PURE__*/_jsxDEV("label", {
            children: "Full name"
          }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
            required: true,
            value: form.name,
            onChange: set('name'),
            placeholder: "Juan dela Cruz"
          }, void 0, false)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          className: "field",
          children: [/*#__PURE__*/_jsxDEV("label", {
            children: "Email"
          }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
            type: "email",
            required: true,
            value: form.email,
            onChange: set('email'),
            placeholder: "juan@ghmemorialpark.com"
          }, void 0, false)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          className: "field",
          children: [/*#__PURE__*/_jsxDEV("label", {
            children: "Role"
          }, void 0, false), /*#__PURE__*/_jsxDEV("select", {
            value: form.role,
            onChange: set('role'),
            children: [canGrantSuperAdmin && /*#__PURE__*/_jsxDEV("option", {
              value: "superadmin",
              children: "Super Admin"
            }, void 0, false), /*#__PURE__*/_jsxDEV("option", {
              value: "admin",
              children: "Admin"
            }, void 0, false), /*#__PURE__*/_jsxDEV("option", {
              value: "staff",
              children: "Staff"
            }, void 0, false)]
          }, void 0, true), !canGrantSuperAdmin && /*#__PURE__*/_jsxDEV("div", {
            style: {
              fontSize: 11,
              color: 'var(--ink-3)',
              marginTop: 5
            },
            children: "Only a Super Admin can grant the Super Admin role."
          }, void 0, false)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          className: "modal-actions",
          children: [/*#__PURE__*/_jsxDEV("button", {
            type: "button",
            className: "btn btn-outline",
            onClick: onClose,
            children: "Cancel"
          }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
            type: "submit",
            className: "btn btn-primary",
            disabled: busy,
            children: busy ? 'Saving…' : 'Add user'
          }, void 0, false)]
        }, void 0, true)]
      }, void 0, true)]
    }, void 0, true)
  }, void 0, false);
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
  if (!rows) return /*#__PURE__*/_jsxDEV("div", {
    className: "loading",
    children: [/*#__PURE__*/_jsxDEV("div", {
      className: "spinner"
    }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
      children: "Loading Recently Deleted…"
    }, void 0, false)]
  }, void 0, true);
  return /*#__PURE__*/_jsxDEV(_Fragment, {
    children: [toast && /*#__PURE__*/_jsxDEV(Toast, {
      msg: toast,
      onDone: () => setToast('')
    }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
      className: "section-hd",
      children: /*#__PURE__*/_jsxDEV("h2", {
        children: ["Recently Deleted ", /*#__PURE__*/_jsxDEV("span", {
          style: {
            color: 'var(--ink-3)',
            fontWeight: 400,
            fontSize: 13
          },
          children: ["(", rows.length, ")"]
        }, void 0, true)]
      }, void 0, true)
    }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
      className: "table-card",
      children: rows.length === 0 ? /*#__PURE__*/_jsxDEV("div", {
        className: "empty",
        children: "Nothing here. Deleted inquiries and customers show up in this list before they're gone for good."
      }, void 0, false) : /*#__PURE__*/_jsxDEV("table", {
        className: "gh-table",
        children: [/*#__PURE__*/_jsxDEV("thead", {
          children: /*#__PURE__*/_jsxDEV("tr", {
            children: [/*#__PURE__*/_jsxDEV("th", {
              children: "Type"
            }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
              children: "Name"
            }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
              children: "Email"
            }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
              children: "Deleted"
            }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
              children: "Deleted by"
            }, void 0, false), /*#__PURE__*/_jsxDEV("th", {}, void 0, false)]
          }, void 0, true)
        }, void 0, false), /*#__PURE__*/_jsxDEV("tbody", {
          children: rows.map(r => /*#__PURE__*/_jsxDEV("tr", {
            children: [/*#__PURE__*/_jsxDEV("td", {
              children: /*#__PURE__*/_jsxDEV("span", {
                className: "plan-badge",
                children: typeLabel(r.collection)
              }, void 0, false)
            }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
              children: /*#__PURE__*/_jsxDEV("strong", {
                children: nameOf(r)
              }, void 0, false)
            }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
              children: r.data && r.data.email || '—'
            }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
              style: {
                color: 'var(--ink-3)'
              },
              children: r.deletedAt ? new Date(r.deletedAt).toLocaleString('en-PH') : '—'
            }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
              style: {
                color: 'var(--ink-3)'
              },
              children: r.deletedBy || '—'
            }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
              children: /*#__PURE__*/_jsxDEV("div", {
                style: {
                  display: 'flex',
                  gap: 6
                },
                children: [/*#__PURE__*/_jsxDEV("button", {
                  className: "btn btn-outline btn-sm",
                  disabled: busyId === r._id,
                  onClick: () => restore(r),
                  children: busyId === r._id ? '…' : '↩ Restore'
                }, void 0, false), canPurge && /*#__PURE__*/_jsxDEV("button", {
                  className: "btn btn-danger btn-sm",
                  disabled: busyId === r._id,
                  onClick: () => purge(r),
                  children: "Delete forever"
                }, void 0, false)]
              }, void 0, true)
            }, void 0, false)]
          }, r._id, true))
        }, void 0, false)]
      }, void 0, true)
    }, void 0, false)]
  }, void 0, true);
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
  if (!rows) return /*#__PURE__*/_jsxDEV("div", {
    className: "loading",
    children: [/*#__PURE__*/_jsxDEV("div", {
      className: "spinner"
    }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
      children: "Loading pending payments…"
    }, void 0, false)]
  }, void 0, true);

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
  return /*#__PURE__*/_jsxDEV("div", {
    children: [toast && /*#__PURE__*/_jsxDEV(Toast, {
      msg: toast,
      onDone: () => setToast('')
    }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
      className: "section-hd",
      children: /*#__PURE__*/_jsxDEV("h2", {
        children: ["Pending Payments ", /*#__PURE__*/_jsxDEV("span", {
          style: {
            color: 'var(--ink-3)',
            fontWeight: 400,
            fontSize: 13
          },
          children: ["(", pending.length, ")"]
        }, void 0, true)]
      }, void 0, true)
    }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
      className: "table-card",
      children: pending.length === 0 ? /*#__PURE__*/_jsxDEV("div", {
        className: "empty",
        children: "No pending payment submissions right now. New GCash references from the customer portal will show up here."
      }, void 0, false) : /*#__PURE__*/_jsxDEV("table", {
        className: "gh-table",
        children: [/*#__PURE__*/_jsxDEV("thead", {
          children: /*#__PURE__*/_jsxDEV("tr", {
            children: [/*#__PURE__*/_jsxDEV("th", {
              children: "Customer"
            }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
              children: "Reference"
            }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
              children: "Amount"
            }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
              children: "Payment date"
            }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
              children: "Submitted"
            }, void 0, false), /*#__PURE__*/_jsxDEV("th", {}, void 0, false)]
          }, void 0, true)
        }, void 0, false), /*#__PURE__*/_jsxDEV("tbody", {
          children: pending.map(({
            customer,
            sub
          }) => {
            const key = customer._id + '_' + sub.submittedAt;
            const isBusy = busyKey === key;
            return /*#__PURE__*/_jsxDEV("tr", {
              children: [/*#__PURE__*/_jsxDEV("td", {
                children: [/*#__PURE__*/_jsxDEV("strong", {
                  children: customer.fullName || `${customer.firstName || ''} ${customer.lastName || ''}`
                }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                  style: {
                    fontSize: 12,
                    color: 'var(--ink-3)'
                  },
                  children: customer.email
                }, void 0, false)]
              }, void 0, true), /*#__PURE__*/_jsxDEV("td", {
                children: [sub.referenceNumber, sub.mobileNumber && /*#__PURE__*/_jsxDEV("div", {
                  style: {
                    fontSize: 12,
                    color: 'var(--ink-3)'
                  },
                  children: sub.mobileNumber
                }, void 0, false)]
              }, void 0, true), /*#__PURE__*/_jsxDEV("td", {
                children: fmt(sub.amount)
              }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                children: sub.date
              }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                style: {
                  fontSize: 12,
                  color: 'var(--ink-3)'
                },
                children: sub.submittedAt ? new Date(sub.submittedAt).toLocaleString() : '—'
              }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                children: /*#__PURE__*/_jsxDEV("div", {
                  style: {
                    display: 'flex',
                    gap: 6
                  },
                  children: [/*#__PURE__*/_jsxDEV("button", {
                    className: "btn btn-primary btn-sm",
                    disabled: isBusy,
                    onClick: () => resolve(customer, sub, 'confirm'),
                    children: isBusy ? '…' : '✓ Confirm'
                  }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
                    className: "btn btn-outline btn-sm",
                    disabled: isBusy,
                    onClick: () => resolve(customer, sub, 'reject'),
                    children: "Reject"
                  }, void 0, false)]
                }, void 0, true)
              }, void 0, false)]
            }, key, true);
          })
        }, void 0, false)]
      }, void 0, true)
    }, void 0, false)]
  }, void 0, true);
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
}];
function Dashboard({
  user,
  onLogout
}) {
  const [tab, setTab] = useState('pipeline');
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
  const [myRole, setMyRole] = useState(null);
  useEffect(() => {
    return window.db.collection('users').doc(user.uid).onSnapshot(doc => {
      setMyRole(doc.exists ? doc.data().role || 'staff' : 'unlinked');
    });
  }, [user.uid]);
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
  return /*#__PURE__*/_jsxDEV("div", {
    className: "layout",
    children: [/*#__PURE__*/_jsxDEV("aside", {
      className: "sidebar",
      children: [/*#__PURE__*/_jsxDEV("div", {
        className: "sidebar-logo",
        children: [/*#__PURE__*/_jsxDEV("img", {
          src: "/logo-header.png",
          alt: "Golden Harmonic logo",
          style: {
            width: 34,
            height: 34,
            objectFit: 'contain',
            flexShrink: 0
          }
        }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
          children: [/*#__PURE__*/_jsxDEV("div", {
            className: "sidebar-name",
            children: "Golden Harmonic"
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            className: "sidebar-sub",
            children: "Admin Panel"
          }, void 0, false)]
        }, void 0, true)]
      }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
        className: "sidebar-divider"
      }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
        className: "sidebar-section",
        children: "Management"
      }, void 0, false), /*#__PURE__*/_jsxDEV("nav", {
        className: "sidebar-nav",
        children: visibleTabs.map(t => /*#__PURE__*/_jsxDEV("div", {
          className: `nav-item ${tab === t.id ? 'active' : ''}`,
          onClick: () => setTab(t.id),
          children: [/*#__PURE__*/_jsxDEV("span", {
            className: "ico",
            children: t.ico
          }, void 0, false), /*#__PURE__*/_jsxDEV("span", {
            children: t.label
          }, void 0, false), counts[t.id] > 0 && /*#__PURE__*/_jsxDEV("span", {
            style: {
              marginLeft: 'auto',
              background: 'rgba(255,255,255,.2)',
              fontSize: 10,
              fontWeight: 700,
              padding: '2px 7px',
              borderRadius: 10
            },
            children: counts[t.id]
          }, void 0, false)]
        }, t.id, true))
      }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
        className: "sidebar-footer",
        children: /*#__PURE__*/_jsxDEV("button", {
          className: "logout-btn",
          onClick: onLogout,
          children: [/*#__PURE__*/_jsxDEV("span", {
            style: {
              fontSize: 16
            },
            children: "🚪"
          }, void 0, false), " Sign out"]
        }, void 0, true)
      }, void 0, false)]
    }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
      className: "main",
      children: [/*#__PURE__*/_jsxDEV("div", {
        className: "topbar",
        children: [/*#__PURE__*/_jsxDEV("div", {
          className: "topbar-title",
          children: TABS.find(t => t.id === tab)?.label
        }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
          className: "topbar-right",
          children: /*#__PURE__*/_jsxDEV("span", {
            className: "user-badge",
            children: ["Signed in as ", /*#__PURE__*/_jsxDEV("strong", {
              children: user.email
            }, void 0, false), myRole && myRole !== 'unlinked' ? ` · ${myRole}` : '']
          }, void 0, true)
        }, void 0, false)]
      }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
        className: "content",
        children: [/*#__PURE__*/_jsxDEV("div", {
          className: "stats-row",
          children: visibleTabs.filter(t => t.id !== 'pipeline' && t.id !== 'trash').map(t => /*#__PURE__*/_jsxDEV("div", {
            className: "stat-card",
            style: {
              cursor: 'pointer'
            },
            onClick: () => setTab(t.id),
            children: [/*#__PURE__*/_jsxDEV("div", {
              className: "stat-badge",
              style: {
                background: `var(--badge-${t.badge})`,
                color: `var(--badge-${t.badge}-ic)`
              },
              children: t.ico
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              children: [/*#__PURE__*/_jsxDEV("div", {
                className: "stat-num",
                children: counts[t.id]
              }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                className: "stat-lbl",
                children: t.label
              }, void 0, false)]
            }, void 0, true)]
          }, t.id, true))
        }, void 0, false), tab === 'pipeline' && /*#__PURE__*/_jsxDEV(Pipeline, {
          currentUser: user
        }, void 0, false), tab === 'inquiries' && /*#__PURE__*/_jsxDEV(Inquiries, {
          currentUser: user
        }, void 0, false), tab === 'customers' && /*#__PURE__*/_jsxDEV(Customers, {
          currentUser: user
        }, void 0, false), tab === 'pending' && /*#__PURE__*/_jsxDEV(PendingPayments, {
          currentUser: user
        }, void 0, false), tab === 'products' && isAdminOrHigher && /*#__PURE__*/_jsxDEV(Products, {}, void 0, false), tab === 'users' && isAdminOrHigher && /*#__PURE__*/_jsxDEV(Users, {
          currentUser: user,
          currentRole: myRole
        }, void 0, false), tab === 'trash' && /*#__PURE__*/_jsxDEV(RecentlyDeleted, {
          currentUser: user,
          canPurge: isAdminOrHigher
        }, void 0, false)]
      }, void 0, true)]
    }, void 0, true)]
  }, void 0, true);
}

// ── Root ───────────────────────────────────────────────────────────────────
function Root() {
  const [user, setUser] = useState(undefined); // undefined = checking

  useEffect(() => {
    return window.auth.onAuthStateChanged(u => setUser(u || null));
  }, []);
  const logout = () => window.auth.signOut();
  if (user === undefined) return /*#__PURE__*/_jsxDEV("div", {
    className: "loading",
    style: {
      minHeight: '100vh',
      display: 'grid',
      placeItems: 'center'
    },
    children: /*#__PURE__*/_jsxDEV("div", {
      children: [/*#__PURE__*/_jsxDEV("div", {
        className: "spinner"
      }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
        children: "Checking login…"
      }, void 0, false)]
    }, void 0, true)
  }, void 0, false);
  if (!user) return /*#__PURE__*/_jsxDEV(Login, {
    onLogin: setUser
  }, void 0, false);
  return /*#__PURE__*/_jsxDEV(Dashboard, {
    user: user,
    onLogout: logout
  }, void 0, false);
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/_jsxDEV(Root, {}, void 0, false));