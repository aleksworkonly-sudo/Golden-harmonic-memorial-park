// Golden Harmonic Memorial Park - printable payment terms (Payment Agreement / Spot Cash Contract).
// Add this file at the repo root, then load it in admin.html. Wording comes from the company's own Word files.
(function () {
  var esc = function (v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  var money = function (n) { return (Number(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var toMs = function (v) { return v && v.toDate ? v.toDate().getTime() : typeof v === 'number' ? v : v ? new Date(v).getTime() : null; };
  var line = function (v, w) { return v ? '<u>&nbsp;' + esc(v) + '&nbsp;</u>' : '<span class="bl" style="width:' + (w || 180) + 'px"></span>'; };
  var ord = function (n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

  function build(a) {
    var cash = a.plan === 'cash';
    var plots = (Array.isArray(a.plots) && a.plots.length ? a.plots : [{ blockId: a.blockId, lotNo: a.lotNo, plotCode: a.plotCode, typeId: a.typeId }]);
    var TYPE = {
      regular: 'Regular',
      premium: 'Premium',
      'corner-premium': 'Corner Premium',
      valor: 'Valor',
      'garden-regular': 'Garden',
      'garden-premium': 'Premium Garden',
      'garden-corner': 'Corner Premium Garden',
      'family-vault': 'Family Vault',
      'premium-valor': 'Premium Valor',
      'corner-premium-valor': 'Corner Premium Valor',
      mausoleum: 'Mausoleum'
    };
    var types = plots.map(function (p) { return TYPE[p.typeId] || p.typeId || ''; }).filter(function (v, i, r) { return v && r.indexOf(v) === i; }).join(', ');
    var lots = plots.map(function (p) { return p.plotCode || ((p.blockId ? 'Block ' + p.blockId + ' ' : '') + (p.lotNo ? 'Lot ' + p.lotNo : '')); }).filter(Boolean).join(', ');
    var pays = (Array.isArray(a.payments) ? a.payments : []).slice().sort(function (x, y) { return (toMs(x.date) || 0) - (toMs(y.date) || 0); });
    var first = pays[0];
    var when = new Date(first && toMs(first.date) || Date.now());
    var day = ord(when.getDate()), month = when.toLocaleDateString('en-PH', { month: 'long' }), year = when.getFullYear();
    var total = a.totalPrice || 0;
    var down = first ? Number(first.amount) || 0 : 0;
    var months = (a.years || 0) * 12;
    var dueDay = Math.min(28, when.getDate());
    var name = a.name || '';
    var title = cash ? 'SPOT CASH FULL PAYMENT CONTRACT' : 'PAYMENT AGREEMENT';
    var sub = cash ? 'Memorial Park Plot / Crypt Purchase' : 'Memorial Park Plot / Crypt Installment Purchase';
    var doc = cash ? 'Contract' : 'Agreement', DOC = cash ? 'CONTRACT' : 'AGREEMENT';
    var h = [];
    var P = function (t) { h.push('<p>' + t + '</p>'); };
    var H = function (t) { h.push('<h4>' + t + '</h4>'); };
    var UL = function (items) { h.push('<ul>' + items.map(function (i) { return '<li>' + i + '</li>'; }).join('') + '</ul>'); };
    h.push('<div class="c"><b>GOLDEN HARMONIC MEMORIAL PARK</b></div><div class="c t">' + title + '</div><div class="c"><b>' + sub + '</b></div>');
    P('This ' + (cash ? 'Spot Cash Full Payment Contract (“Contract”)' : 'Payment Agreement (“Agreement”)') + ' is made and entered into this <u>&nbsp;' + day + '&nbsp;</u> day of <u>&nbsp;' + month + '&nbsp;</u>, ' + year + ', in ' + line('', 170) + ', Philippines, by and between:');
    P('<b>GOLDEN HARMONIC MEMORIAL PARK, INC.</b>, a corporation duly organized and existing under the laws of the Republic of the Philippines, with principal office at ' + line('', 200) + ', represented herein by its authorized officer, hereinafter referred to as the <b>“SELLER”</b>;');
    P('-and-');
    P('<b>' + line(name, 200) + '</b>, of legal age, Filipino, with residence and postal address at ' + line(a.address || '', 220) + ', hereinafter referred to as the <b>“BUYER.”</b>');
    P('The SELLER and the BUYER are hereinafter collectively referred to as the <b>“PARTIES.”</b>');
    var n = 0, N = function () { return ++n + '. '; };
    H(N() + 'SUBJECT OF THE ' + DOC);
    P('The SELLER agrees to sell, and the BUYER agrees to purchase, the following memorial park property:');
    UL(['<b>Plot Type:</b> ' + line(types, 200), '<b>Location / Block / Lot No.:</b> ' + line(lots, 200), '<b>Area / Size:</b> ' + line('', 200), '<b>Number of Crypts:</b> ' + line('', 200)]);
    H(N() + 'PURCHASE PRICE');
    P('The total purchase price of the above-described memorial park property is:');
    P('<b>PHP ' + (total ? '<u>&nbsp;' + money(total) + '&nbsp;</u>' : line('', 160)) + '</b>');
    if (cash) {
      H(N() + 'FULL PAYMENT');
      P('The BUYER acknowledges and agrees that the full purchase price has been paid in full upon execution of this Contract.');
      P('The SELLER acknowledges receipt of the full payment in the amount stated above.');
      H(N() + 'TRANSFER OF RIGHTS');
      P('Upon full payment, the SELLER shall transfer to the BUYER all rights, interests, and ownership over the subject property, subject to the rules and regulations of Golden Harmonic Memorial Park and applicable law.');
      H(N() + 'NO FURTHER INSTALLMENT OBLIGATION');
      P('Because this is a spot cash full payment transaction, the BUYER shall have no further installment obligation on the subject property, except for any future charges, fees, or obligations expressly allowed by law or company policy.');
      H(N() + 'TAXES AND FEES');
      P('All taxes, fees, and charges arising from the sale, transfer, or registration of the property shall be borne by the party required by law or by agreement of the PARTIES.');
      H(N() + 'POSSESSION AND USE');
      P('The BUYER shall have the right to use the plot only in accordance with the rules and regulations of Golden Harmonic Memorial Park and applicable laws, rules, and ordinances.');
      H(N() + 'COMPANY RULES');
      P('The BUYER agrees to comply with all memorial park rules, regulations, policies, and future reasonable amendments adopted by the SELLER.');
      H(N() + 'REFUND POLICY');
      P('The BUYER acknowledges that any refund, if allowed by the SELLER, shall be subject to the Company’s refund policy and applicable law.');
      H(N() + 'TRANSFER / ASSIGNMENT');
      P('The BUYER may not transfer, assign, or sell the rights under this Contract without the prior written consent of the SELLER and compliance with the Company’s transfer policy.');
      H(N() + 'WARRANTIES OF THE SELLER');
      P('The SELLER warrants that it has the authority to enter into this Contract and to sell the subject property, subject to the terms herein and applicable law.');
      H(N() + 'GOVERNING LAW');
      P('This Contract shall be governed by and construed in accordance with the laws of the Republic of the Philippines.');
      H(N() + 'ENTIRE AGREEMENT');
      P('This Contract contains the entire agreement between the PARTIES with respect to the subject matter hereof and supersedes all prior discussions, representations, or agreements.');
    } else {
      H(N() + 'PAYMENT TERMS');
      P('The BUYER shall pay the purchase price in installments as follows:');
      UL(['<b>Down Payment:</b> PHP ' + (down ? '<u>&nbsp;' + money(down) + '&nbsp;</u>' : line('', 140)),
        '<b>Monthly Amortization:</b> PHP ' + (a.monthly ? '<u>&nbsp;' + money(a.monthly) + '&nbsp;</u>' : line('', 140)),
        '<b>Number of Months:</b> ' + (months ? '<u>&nbsp;' + months + '&nbsp;</u>' : line('', 100)),
        '<b>Due Date of Monthly Payment:</b> ' + (first ? '<u>&nbsp;Every ' + ord(dueDay) + ' day of the month&nbsp;</u>' : line('', 180))]);
      P('All payments shall be made only through the SELLER’s approved payment channels.');
      H(N() + 'ADVANCE OR EXCESS PAYMENTS');
      P('Any amount paid by the BUYER in excess of the required monthly installment shall be applied to the principal balance of the account, unless otherwise agreed in writing by the SELLER.');
      P('When advance payments are applied to the principal balance, the remaining balance shall be recomputed. The monthly installment amount shall remain unchanged, while the number of remaining monthly payments shall be reduced accordingly.');
      P('Excess payments shall not automatically be treated as payment for future monthly installments unless confirmed in writing by the SELLER.');
      H(N() + 'NO TRANSFER OF OWNERSHIP UNTIL FULL PAYMENT');
      P('The BUYER acknowledges that this is a <b>Contract to Sell</b> and not yet a Deed of Absolute Sale.');
      P('Ownership, title, and full rights over the property shall be transferred to the BUYER only upon:');
      h.push('<ol><li>full payment of the purchase price;</li><li>compliance with all terms and conditions of this Agreement;</li><li>execution of the appropriate Deed of Absolute Sale or other transfer document, if applicable.</li></ol>');
      H(N() + 'PAYMENT DEFAULT');
      P('If the BUYER fails to pay the monthly amortization for <b>three (3) consecutive months</b>, the SELLER may apply the Company’s policy on default, notice, and forfeiture, subject to due process and applicable law.');
      H(N() + 'NOTICE REQUIREMENT');
      P('Before any forfeiture or cancellation, the SELLER shall provide notice through one or more of the following:');
      UL(['email', 'physical written notice', 'phone call', 'text message']);
      P('The BUYER acknowledges that the Company may require proof of receipt for physical notices sent to the BUYER’s address.');
      H(N() + 'FORFEITURE / CANCELLATION');
      P('If the BUYER remains unpaid and gives no response after the required notices, the SELLER may cancel the installment plan and recover the plot, subject to the Company’s policy and applicable law.');
      P('If the BUYER later pays the full remaining amount after the notice period, the SELLER may accept the payment, subject to an additional <b>PHP 1,500.00 administrative fee</b>.');
      H(N() + 'REFUND POLICY');
      P('The BUYER acknowledges that any refund, if allowed by the SELLER, shall be subject to the Company’s refund policy and applicable law.');
      H(N() + 'TRANSFER / ASSIGNMENT');
      P('The BUYER may not transfer, assign, or sell the rights under this Agreement without the prior written consent of the SELLER and compliance with the Company’s transfer policy.');
      P('If the BUYER is unable to continue paying and wishes to transfer or assign the account, the transfer shall be subject to the Company’s assumption policy, administrative fee, and approval requirements.');
      H(N() + 'ASSUMPTION / TRANSFER OF ACCOUNT');
      P('If the BUYER requests a transfer or assumption of account:');
      UL(['the request must be made in writing;', 'the transfer must be completed within the period allowed by Company policy;', 'an administrative fee of <b>PHP 2,000.00</b> may apply;', 'the remaining unpaid balance must be settled unless otherwise approved in writing by the Company;', 'the new buyer must be approved by the Company and complete the required documentation.']);
      H(N() + 'TAXES AND FEES');
      P('All taxes, fees, and charges arising from the sale, transfer, or registration of the property shall be borne by the party required by law or by agreement of the PARTIES.');
      H(N() + 'POSSESSION AND USE');
      P('The BUYER shall have the right to use the plot only in accordance with the rules and regulations of Golden Harmonic Memorial Park and applicable laws, rules, and ordinances.');
      H(N() + 'COMPANY RULES');
      P('The BUYER agrees to comply with all memorial park rules, regulations, policies, and future reasonable amendments adopted by the SELLER.');
      H(N() + 'WARRANTIES OF THE SELLER');
      P('The SELLER warrants that it has the authority to enter into this Agreement and to sell the subject property, subject to the terms herein and applicable law.');
      H(N() + 'GOVERNING LAW');
      P('This Agreement shall be governed by and construed in accordance with the laws of the Republic of the Philippines.');
      H(N() + 'ENTIRE AGREEMENT');
      P('This Agreement contains the entire agreement between the PARTIES with respect to the subject matter hereof and supersedes all prior discussions, representations, or agreements.');
    }
    H(N() + 'SIGNATURES');
    P('IN WITNESS WHEREOF, the PARTIES have hereunto set their hands this ' + line('', 40) + ' day of ' + line('', 110) + ', ' + year + ', in ' + line('', 150) + ', Philippines.');
    h.push('<div class="sig"><div><b>SELLER:</b><br><b>GOLDEN HARMONIC MEMORIAL PARK, INC.</b><br>By: ' + line('', 190) + '<br>Name: ' + line('', 190) + '<br>Title: ' + line('', 190) + '</div><div><b>BUYER:</b><br><br>Name: ' + line(name, 190) + '<br>Signature: ' + line('', 190) + '</div></div>');
    P('Signed in the presence of:');
    P('Witness: ' + line('', 220) + '&nbsp;&nbsp;&nbsp; Witness: ' + line('', 220));
    h.push('<div class="pb"></div><div class="c"><b>ACKNOWLEDGMENT</b></div><p>REPUBLIC OF THE PHILIPPINES</p>');
    P('BEFORE ME, a Notary Public for and in ' + line('', 170) + ', this ' + line('', 40) + ' day of ' + line('', 110) + ', ' + year + ', personally appeared:');
    h.push('<table><tr><th>Name</th><th>ID Presented</th><th>ID No.</th><th>Date/Place Issued</th></tr><tr><td>' + esc(name) + '</td><td></td><td></td><td></td></tr>' + (cash ? '' : '<tr><td>&nbsp;</td><td></td><td></td><td></td></tr>') + '</table>');
    P('known to me and to me known to be the same persons who executed the foregoing instrument and they acknowledged to me that the same is their free and voluntary act and deed.');
    P('WITNESS MY HAND AND NOTARIAL SEAL.');
    return { title: title, body: h.join('') + '<p class="ref">Reservation ref: ' + esc(a.ref || '') + '</p>' };
  }

  // Opens the printable agreement for a presale sale (presaleApplications doc). Returns false if the pop-up was blocked.
  window.printPaymentTerms = function (a) {
    var d = build(a);
    var w = window.open('', '_blank');
    if (!w) return false;
    w.document.write('<html><head><title>' + esc(d.title + ' - ' + (a.name || '')) + '</title><style>' +
      '@page{size:A4;margin:18mm}body{font-family:"Times New Roman",serif;font-size:12.5pt;line-height:1.45;color:#000}' +
      '.c{text-align:center}.t{font-size:16pt;font-weight:bold;margin:4px 0}h4{margin:14px 0 4px;font-size:12.5pt}p{margin:5px 0;text-align:justify}ul,ol{margin:4px 0 4px 22px}' +
      '.bl{display:inline-block;border-bottom:1px solid #000;height:1em}u{text-decoration:none;border-bottom:1px solid #000}' +
      '.sig{display:flex;gap:40px;margin:14px 0}.sig>div{flex:1;line-height:2}' +
      'table{border-collapse:collapse;width:100%;margin:8px 0}th,td{border:1px solid #000;padding:8px;text-align:left;height:28px}' +
      '.pb{page-break-after:always}.ref{font-size:9pt;color:#555;margin-top:20px}' +
      '</style></head><body>' + d.body + '</body></html>');
    w.document.close();
    w.focus();
    w.print();
    return true;
  };
})();
