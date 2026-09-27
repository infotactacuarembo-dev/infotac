'use strict';
// Isolated policy draft; not wired to routes or billing.
const STATES = Object.freeze(['trial','active','suspended','expired','cancelled']);
const EDGES = Object.freeze({trial:['active','suspended','expired','cancelled'],active:['suspended','expired','cancelled'],suspended:['active','expired','cancelled'],expired:['active','cancelled'],cancelled:[]});
function eligibleAdmin({authUserId,aal,record,isProduction}={}) {
 return isProduction===true && typeof authUserId==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(authUserId) && aal==='aal2' && record!=null && record.auth_user_id===authUserId && record.active===true;
}
function assertTransition({from,to,reason,endsAt}={}) {
 if(!STATES.includes(from)||!STATES.includes(to)||!EDGES[from].includes(to))throw Error('Transición inválida');
 if(typeof reason!=='string'||reason.trim().length<3||reason.length>500)throw Error('Motivo requerido');
 if(to==='active' && (typeof endsAt!=='string'||!Number.isFinite(Date.parse(endsAt))))throw Error('Vigencia requerida');
 return true;
}
module.exports={STATES,EDGES,eligibleAdmin,assertTransition};
