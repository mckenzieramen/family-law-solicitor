const base='https://firestore.googleapis.com/v1/projects/family-law-firm/databases/(default)/documents/';
const key='AIzaSyBSRANSn7e2npR9SZ_tRdtxwe8QH-VAVUA';
const json=(v,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
export async function onRequest({request,env}){
 if(!env.DOCUMENT_STORAGE)return json({error:'Storage binding missing'},503);
 const token=/^Bearer (.+)$/.exec(request.headers.get('Authorization')||'')?.[1];if(!token)return json({error:'Sign in required'},401);
 try{
 const identity=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='+key,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token})});
 const user=(await identity.json()).users?.[0];if(!identity.ok||!user?.localId||user.disabled)return json({error:'Invalid session'},401);
 const uid=user.localId;
 const read=async path=>{const res=await fetch(base+path,{headers:{Authorization:'Bearer '+token}});return res.ok?(await res.json()).fields:null};
 const profile=await read('users/'+encodeURIComponent(uid));const role=profile?.role?.stringValue;
 if(!['solicitor','employee','admin'].includes(role)||(role==='admin'&&profile.Active?.booleanValue!==true))return json({error:'Staff access required'},403);
 if(request.method==='GET'&&new URL(request.url).searchParams.get('action')==='health')return json({ready:true});
 return json({error:'Upload integration not enabled yet'},501);
 }catch{return json({error:'Storage verification failed'},502)}
}
