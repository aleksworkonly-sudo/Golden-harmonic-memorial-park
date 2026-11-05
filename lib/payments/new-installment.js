'use strict';
const {installmentDueDate}=require('./calendar');

// Opt-in terms only; older accepted reservation schedules are unchanged.
function newInstallment(a,payments=a.payments || []) {
  if(a.plan!=='installment' || a.installmentCalculation!=='remaining_after_deposit_v1')return null;
  const count=a.plots?.length || a.plotCount || 1,months=a.years*12;
  const total=Math.round(a.totalPrice*100),required=count*(a.depositPerPlotCentavos || 300000);
  if(!Number.isSafeInteger(total) || ![12,24,36,60].includes(months))return null;
  const sorted=[...payments].sort((x,y)=>Number(x.date)-Number(y.date));
  let paid=0,funded=0,completedAt=null;
  for(const p of sorted){
    paid+=Math.round(Number(p.amount || 0)*100);
    if(completedAt===null && paid>=required){funded=paid;completedAt=Number(p.date);}
  }
  const principal=Math.max(0,total-(completedAt===null?required:funded));
  const monthly=Math.floor(principal/months),balance=Math.max(0,total-paid);
  const monthsPaid=monthly>0?Math.min(months,Math.floor(Math.max(0,paid-funded)/monthly)):0;
  const nextDue=balance>0 && completedAt!==null?Date.parse(installmentDueDate(completedAt,monthsPaid+1)+'T00:00:00+08:00'):null;
  return {paid:paid/100,balance:balance/100,monthly:monthly/100,monthsPaid,
    monthsLeft:balance<=0?0:Math.max(0,months-monthsPaid),nextDue,depositPaid:Math.min(paid,required)/100};
}
module.exports={newInstallment};
