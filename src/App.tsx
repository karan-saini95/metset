
// @ts-nocheck
import { useState, useEffect } from "react";

const COLORS = ["#7C3AED","#059669","#DC2626","#D97706","#2563EB","#DB2777","#0891B2","#65A30D"];
const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const DAYS_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const VAPID_PUBLIC_KEY = "BMlu_ELzL3LFaw4BAHU3zEZOCKPIRpTSLdz7U94fdOa57_tFn4cCjYxvhfI5A3oaOEi2C9toDyIsPwL43nZpKM8";

function getToday() { return new Date().toISOString().split("T")[0]; }
function formatDate(d) {
  return new Date(d+"T00:00:00").toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"});
}
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
function getHour(t) { const [h,m]=t.split(":").map(Number); return h*60+m; }
function to12h(t) {
  const [h,m]=t.split(":").map(Number);
  return `${h%12||12}:${m.toString().padStart(2,"0")} ${h>=12?"PM":"AM"}`;
}
function freqLabel(med) {
  if (med.frequency==="daily") return "Daily";
  if (med.frequency==="weekly") return `Weekly · ${DAYS[med.weekDay]}s`;
  if (med.frequency==="biweekly") return `Every 2 weeks · ${DAYS[med.weekDay]}s`;
  return "Daily";
}
function isScheduledOn(med, dateStr) {
  const date = new Date(dateStr+"T12:00:00");
  const dow = date.getDay();
  if (med.frequency==="daily") return true;
  if (med.frequency==="weekly") return dow===med.weekDay;
  if (med.frequency==="biweekly") {
    if (dow!==med.weekDay) return false;
    const start = new Date(med.createdAt+"T12:00:00");
    const diffWeeks = Math.round((date-start)/(7*24*60*60*1000));
    return diffWeeks%2===0;
  }
  return true;
}
function getStreak(logs) {
  const days={};
  logs.forEach(l=>{
    const day=l.scheduledAt.split("T")[0];
    if(!days[day]) days[day]={total:0,taken:0};
    days[day].total++;
    if(l.status==="taken") days[day].taken++;
  });
  let streak=0,skipped=false;
  const today=getToday();
  let cursor=new Date(today+"T12:00:00");
  while(true){
    const key=cursor.toISOString().split("T")[0];
    const e=days[key];
    if(!e){cursor.setDate(cursor.getDate()-1);if(cursor<new Date("2020-01-01"))break;continue;}
    if(key===today&&e.taken===0&&!skipped){skipped=true;cursor.setDate(cursor.getDate()-1);continue;}
    if(e.taken<e.total) break;
    streak++;
    cursor.setDate(cursor.getDate()-1);
    if(cursor<new Date("2020-01-01"))break;
  }
  return streak;
}
function getHeatmap(logs) {
  const map={};
  logs.forEach(l=>{
    const day=l.scheduledAt.split("T")[0];
    if(!map[day]) map[day]={total:0,taken:0};
    map[day].total++;
    if(l.status==="taken") map[day].taken++;
  });
  const result=[];
  for(let i=27;i>=0;i--){
    const d=new Date();d.setDate(d.getDate()-i);
    const key=d.toISOString().split("T")[0];
    const e=map[key];
    if(!e) result.push("empty");
    else if(e.taken===e.total) result.push("full");
    else if(e.taken>0) result.push("partial");
    else result.push("missed");
  }
  return result;
}
function generateTodayLogs(medicines, existingLogs) {
  const today=getToday();
  const newLogs=[...existingLogs];
  medicines.forEach(med=>{
    if(!isScheduledOn(med,today)) return;
    med.times.forEach(time=>{
      const scheduledAt=`${today}T${time}:00`;
      if(!newLogs.find(l=>l.medicineId===med.id&&l.scheduledAt===scheduledAt))
        newLogs.push({id:`${med.id}-${scheduledAt}`,medicineId:med.id,scheduledAt,status:"pending",takenAt:null});
    });
  });
  return newLogs;
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

const defaultMeds = [
  {id:"med1",name:"Metformin",dose:"500mg",times:["08:00","21:00"],color:"#7C3AED",pillsRemaining:24,frequency:"daily",weekDay:0,createdAt:"2026-03-15"},
  {id:"med2",name:"Vitamin D",dose:"1000IU",times:["13:00"],color:"#059669",pillsRemaining:30,frequency:"daily",weekDay:0,createdAt:"2026-03-15"}
];
const emptyForm={name:"",dose:"",time:"",color:COLORS[0],pills:"",frequency:"daily",weekDay:new Date().getDay()};

function getNotifStatus() {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export default function App() {
  const [tab, setTab] = useState("today");
  const [medicines, setMedicines] = useState(() => {
    try { return JSON.parse(localStorage.getItem("medi_medicines")) || defaultMeds; } catch { return defaultMeds; }
  });
  const [logs, setLogs] = useState(() => {
    try { return JSON.parse(localStorage.getItem("medi_logs")) || []; } catch { return []; }
  });
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [notifStatus, setNotifStatus] = useState(getNotifStatus);
  const [notifLeadMins, setNotifLeadMins] = useState(() => parseInt(localStorage.getItem("medi_lead_mins")) || 0);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifTestSent, setNotifTestSent] = useState(false);
  const [notifError, setNotifError] = useState(null);

  useEffect(() => {
    const updated = generateTodayLogs(medicines, logs);
    if (updated.length !== logs.length) { setLogs(updated); localStorage.setItem("medi_logs", JSON.stringify(updated)); }
  }, [medicines]);
  useEffect(() => { localStorage.setItem("medi_medicines", JSON.stringify(medicines)); }, [medicines]);
  useEffect(() => { localStorage.setItem("medi_logs", JSON.stringify(logs)); }, [logs]);

useEffect(() => {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js")
      .then(reg => console.log("SW registered", reg))
      .catch(err => console.log("SW failed", err));
  }
}, []);
  const today = getToday();
  const todayLogs = logs
    .filter(l => l.scheduledAt.startsWith(today))
    .sort((a,b) => getHour(a.scheduledAt.split("T")[1].slice(0,5)) - getHour(b.scheduledAt.split("T")[1].slice(0,5)));

  const nonDailyMeds = medicines.filter(m => m.frequency==="weekly"||m.frequency==="biweekly");
  const weeklyContext = [];
  nonDailyMeds.forEach(med => {
    for (let offset=-3; offset<=4; offset++) {
      if (offset===0) continue;
      const d=new Date(today+"T12:00:00"); d.setDate(d.getDate()+offset);
      const dateStr=d.toISOString().split("T")[0];
      if (!isScheduledOn(med, dateStr)) continue;
      med.times.forEach(time => {
        const scheduledAt=`${dateStr}T${time}:00`;
        const existingLog=logs.find(l=>l.medicineId===med.id&&l.scheduledAt===scheduledAt);
        weeklyContext.push({id:existingLog?existingLog.id:`${med.id}-${scheduledAt}`,medicineId:med.id,scheduledAt,status:existingLog?existingLog.status:"pending",takenAt:existingLog?existingLog.takenAt:null,offset,dateStr,time});
      });
    }
  });
  weeklyContext.sort((a,b)=>new Date(a.scheduledAt)-new Date(b.scheduledAt));

  const takenCount = todayLogs.filter(l=>l.status==="taken").length;
  const streak = getStreak(logs);
  const heatmap = getHeatmap(logs);
  const getMed = id => medicines.find(m=>m.id===id);
  const adherence = medicines.map(med=>{
    const ml=logs.filter(l=>l.medicineId===med.id&&l.status!=="pending");
    const taken=ml.filter(l=>l.status==="taken").length;
    return {...med,pct:ml.length?Math.round(taken/ml.length*100):0};
  });

  function markTaken(logId, scheduledAt, medicineId) {
    const exists = logs.find(l=>l.id===logId);
    if (exists) setLogs(logs.map(l=>l.id===logId?{...l,status:"taken",takenAt:new Date().toISOString()}:l));
    else setLogs([...logs,{id:logId,medicineId,scheduledAt,status:"taken",takenAt:new Date().toISOString()}]);
  }
  function startEdit(med) {
    setForm({name:med.name,dose:med.dose,time:med.times[0],color:med.color,pills:med.pillsRemaining,frequency:med.frequency,weekDay:med.weekDay});
    setEditingId(med.id); setShowForm(true);
  }
 function saveMedicine() {
      if (!form.name||!form.time) return;
      
      // Build updated list first (before setState which is async)
      const updatedMedicinesList = editingId
        ? medicines.map(m => m.id===editingId ? {...m,name:form.name,dose:form.dose,times:[form.time],color:form.color,pillsRemaining:parseInt(form.pills)||m.pillsRemaining,frequency:form.frequency,weekDay:parseInt(form.weekDay)} : m)
        : [...medicines, {id:crypto.randomUUID(),name:form.name,dose:form.dose,times:[form.time],color:form.color,pillsRemaining:parseInt(form.pills)||30,frequency:form.frequency,weekDay:parseInt(form.weekDay),createdAt:getToday()}];

      if (editingId) {
        setMedicines(updatedMedicinesList);
        setEditingId(null);
      } else {
        const med = updatedMedicinesList[updatedMedicinesList.length-1];
        setMedicines(updatedMedicinesList);
        setLogs(generateTodayLogs([med],logs));
      }
      setForm(emptyForm); setShowForm(false);

      // Sync to server using freshly computed list
      fetch("/api/update", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ medicines: updatedMedicinesList })
      });
    }  function cancelForm() { setForm(emptyForm); setEditingId(null); setShowForm(false); }
  function deleteMedicine(id) {
    setMedicines(medicines.filter(m=>m.id!==id));
    setLogs(logs.filter(l=>l.medicineId!==id));
    if (editingId===id) cancelForm();
  }
  function offsetLabel(offset) {
    if (offset===-1) return "Yesterday";
    if (offset===-2) return "2 days ago";
    if (offset===-3) return "3 days ago";
    if (offset===1) return "Tomorrow";
    const d=new Date(today+"T12:00:00");d.setDate(d.getDate()+offset);
    return d.toLocaleDateString("en-US",{weekday:"long"});
  }

  async function syncMedicinesToServer(meds) {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) return;
      await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON(), medicines: meds })
      });
    } catch(e) { console.log("Sync failed", e); }
  }

  async function handleEnableNotifs() {
    setNotifLoading(true);
    setNotifError(null);
    try {
      // 1. Ask for notification permission
      const permission = await Notification.requestPermission();
      setNotifStatus(permission);
      if (permission !== "granted") { setNotifLoading(false); return; }

      // 2. Register service worker
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      // 3. Subscribe to push
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });

      // 4. Send subscription + medicines to server
      const res = await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON(), medicines })
      });

      if (!res.ok) throw new Error("Server error");

    } catch(e) {
      setNotifError("Something went wrong: " + e.message);
      console.error(e);
    }
    setNotifLoading(false);
  }

  function handleTestNotif() {
    if (Notification.permission !== "granted") return;
    new Notification("💊 MediTrack test!", {
      body: "Notifications are working! You'll be reminded at dose times.",
      icon: "/favicon.svg",
    });
    setNotifTestSent(true);
    setTimeout(() => setNotifTestSent(false), 3000);
  }

  function handleLeadChange(mins) {
    setNotifLeadMins(mins);
    localStorage.setItem("medi_lead_mins", mins);
  }

  const s = styles;

  function NotifStatusCard() {
    if (notifStatus === "unsupported") return (
      <div style={{...s.notifCard, borderColor:"#FCA5A5", background:"#FFF5F5"}}>
        <span style={{fontSize:28}}>😔</span>
        <div style={{flex:1}}>
          <p style={{...s.notifCardTitle, color:"#DC2626"}}>Not supported</p>
          <p style={s.notifCardBody}>Open this app in Safari on iPhone and install it via "Add to Home Screen" first, then come back to enable notifications.</p>
        </div>
      </div>
    );
    if (notifStatus === "denied") return (
      <div style={{...s.notifCard, borderColor:"#FCA5A5", background:"#FFF5F5"}}>
        <span style={{fontSize:28}}>🚫</span>
        <div style={{flex:1}}>
          <p style={{...s.notifCardTitle, color:"#DC2626"}}>Notifications blocked</p>
          <p style={s.notifCardBody}>Go to iPhone <strong>Settings → Safari → this site → Notifications → Allow</strong>, then come back here.</p>
        </div>
      </div>
    );
    if (notifStatus === "granted") return (
 <div style={{...s.notifCard, borderColor:"#6EE7B7", background:"#F0FDF4"}}>
  <span style={{fontSize:28}}>✅</span>
  <div style={{flex:1}}>
    <p style={{...s.notifCardTitle, color:"#065F46"}}>Notifications active!</p>
   <p style={s.notifCardBody}>Ambika will get a push notification for every dose - even when the phone is locked. 🎉</p>
    <button style={s.testBtn} onClick={handleTestNotif}>{notifTestSent ? "✓ Sent!" : "Send a test notification"}</button>
    <button style={{...s.testBtn, marginTop:8, background:"#FEF3C7", color:"#92400E"}} 
      onClick={async () => {
<button style={{...s.testBtn, marginTop:8, background:"#FEF3C7", color:"#92400E"}} 
  onClick={async () => {
    try {
      alert("Step 1: registering SW...");
      const reg = await navigator.serviceWorker.register("/sw.js");
      alert("Step 2: getting subscription...");
      const sub = await reg.pushManager.getSubscription();
      if (!sub) { alert("No subscription - need to re-enable notifications"); return; }
      alert("Step 3: sending to server...");
      const res = await fetch("/api/save", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ subscription: sub.toJSON(), medicines })
      });
      alert("Step 4: status " + res.status);
      const data = await res.json();
      alert("Done: " + JSON.stringify(data));
    } catch(e) {
      alert("Error: " + e.message);
    }
  }}>
  Sync subscription to server
</button>
      }}>
      Sync subscription to server
    </button>
  </div>
</div>
);
    return (
      <div style={{...s.notifCard, borderColor:"#C4B5FD", background:"#FAF5FF"}}>
        <span style={{fontSize:28}}>🔔</span>
        <div style={{flex:1}}>
          <p style={s.notifCardTitle}>Enable reminders</p>
          <p style={s.notifCardBody}>Get notified at each dose time so Ambika never misses a medicine.</p>
          {notifError && <p style={{fontSize:12,color:"#DC2626",marginBottom:8}}>{notifError}</p>}
          <button style={s.enableBtn} onClick={handleEnableNotifs} disabled={notifLoading}>
            {notifLoading ? "Setting up…" : "Enable notifications"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={s.app}>
      <div style={s.screen}>

        {tab==="today" && (
          <div style={s.scrollArea}>
            <div style={s.hero}>
              <div style={s.heroGlow}/>
              <p style={s.heroGreeting}>{getGreeting()}</p>
              <p style={s.heroName}>Ambika ✨</p>
              <p style={s.heroDate}>{formatDate(today)}</p>
              {streak>0 && <div style={s.streakPill}>🔥 {streak}-day streak!</div>}
            </div>
            {todayLogs.length>0 && (
              <div style={s.progressBox}>
                <div style={s.progressTop}>
                  <span style={s.progressLabel}>Today's progress</span>
                  <span style={s.progressCount}><span style={s.progressTaken}>{takenCount}</span> / {todayLogs.length}</span>
                </div>
                <div style={s.progressBg}>
                  <div style={{...s.progressFill,width:`${Math.round(takenCount/todayLogs.length*100)}%`}}/>
                </div>
              </div>
            )}
            {todayLogs.length===0 && <p style={s.empty}>No medicines scheduled for today 🌸</p>}
            {todayLogs.map((log,i)=>{
              const med=getMed(log.medicineId); if(!med) return null;
              const time=log.scheduledAt.split("T")[1].slice(0,5);
              const prevTime=i>0?todayLogs[i-1].scheduledAt.split("T")[1].slice(0,5):null;
              const isDue=log.status==="pending";
              const isTaken=log.status==="taken";
              const takenTime=log.takenAt?new Date(log.takenAt).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}):null;
              return (
                <div key={log.id}>
                  {time!==prevTime&&<p style={{...s.timeLabel,color:isDue?"#7C3AED":"#bbb"}}>{to12h(time)}{isDue?" · Due now":""}</p>}
                  <div style={{...s.doseCard,borderLeft:`4px solid ${isTaken?"#10B981":isDue?med.color:"#e5e5e3"}`,opacity:isTaken?0.6:1}}>
                    <div style={{...s.doseCircle,background:isTaken?"#D1FAE5":isDue?med.color+"22":"#f3f0ff"}}>
                      {isTaken?<span style={{fontSize:18}}>✅</span>:isDue?<span style={{fontSize:18}}>💊</span>:<span style={{fontSize:18,opacity:0.4}}>💊</span>}
                    </div>
                    <div style={s.doseInfo}>
                      <p style={s.doseName}>{med.name}</p>
                      <p style={s.doseDose}>{med.dose}</p>
                      <p style={s.doseStatus}>{isTaken?`✓ Taken at ${takenTime}`:isDue?"⏰ Due now":"Upcoming"}</p>
                    </div>
                    {isDue&&<button style={{...s.markBtn,background:med.color}} onClick={()=>markTaken(log.id,log.scheduledAt,log.medicineId)}>Mark taken</button>}
                  </div>
                </div>
              );
            })}
            {weeklyContext.length>0&&(
              <>
                <p style={s.sectionDivider}>💫 Weekly medicines</p>
                {weeklyContext.map(item=>{
                  const med=getMed(item.medicineId); if(!med) return null;
                  const isPast=item.offset<0;
                  const isTaken=item.status==="taken";
                  const isDue=!isPast&&item.status==="pending";
                  const isMissed=isPast&&item.status==="pending";
                  const takenTime=item.takenAt?new Date(item.takenAt).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}):null;
                  const borderColor=isTaken?"#10B981":isMissed?"#EF4444":isDue?med.color:"#d4c9ff";
                  return (
                    <div key={`${item.id}-ctx`} style={{...s.doseCard,borderLeft:`4px solid ${borderColor}`,opacity:isTaken?0.6:1}}>
                      <div style={{...s.doseCircle,background:isTaken?"#D1FAE5":isMissed?"#FEE2E2":"#f3f0ff"}}>
                        {isTaken?<span style={{fontSize:18}}>✅</span>:isMissed?<span style={{fontSize:18}}>⚠️</span>:<span style={{fontSize:18}}>💊</span>}
                      </div>
                      <div style={s.doseInfo}>
                        <p style={s.doseName}>{med.name}</p>
                        <p style={s.doseDose}>{med.dose} · {offsetLabel(item.offset)} at {to12h(item.time)}</p>
                        <p style={{...s.doseStatus,color:isMissed?"#EF4444":isTaken?"#059669":"#7C3AED"}}>{isTaken?`✓ Taken at ${takenTime}`:isMissed?"Missed — tap to log it":"Upcoming"}</p>
                      </div>
                      {(isDue||isMissed)&&<button style={{...s.markBtn,background:isMissed?"#6B7280":med.color}} onClick={()=>markTaken(item.id,item.scheduledAt,item.medicineId)}>{isMissed?"Log it":"Mark taken"}</button>}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

        {tab==="meds"&&(
          <div style={s.scrollArea}>
            <div style={s.medsHeader}>
              <div>
                <p style={s.medsTitle}>My Medicines</p>
                <p style={s.medsSubtitle}>{medicines.length} medicine{medicines.length!==1?"s":""} tracked</p>
              </div>
              <button style={s.addBtn} onClick={()=>{if(showForm&&!editingId)cancelForm();else{setEditingId(null);setForm(emptyForm);setShowForm(true);}}}>{showForm&&!editingId?"Cancel":"+ Add"}</button>
            </div>
            {showForm&&(
              <div style={s.formCard}>
                <p style={s.formTitle}>{editingId?"✏️ Edit medicine":"➕ New medicine"}</p>
                <input style={s.input} placeholder="Medicine name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/>
                <input style={s.input} placeholder="Dose (e.g. 500mg)" value={form.dose} onChange={e=>setForm({...form,dose:e.target.value})}/>
                <input style={s.input} type="time" value={form.time} onChange={e=>setForm({...form,time:e.target.value})}/>
                <div>
                  <p style={s.fieldLabel}>How often?</p>
                  <div style={s.freqRow}>
                    {[["daily","Daily"],["weekly","Weekly"],["biweekly","Every 2 wks"]].map(([val,label])=>(
                      <button key={val} style={{...s.freqBtn,...(form.frequency===val?s.freqBtnActive:{})}} onClick={()=>setForm({...form,frequency:val})}>{label}</button>
                    ))}
                  </div>
                </div>
                {(form.frequency==="weekly"||form.frequency==="biweekly")&&(
                  <div>
                    <p style={s.fieldLabel}>Which day?</p>
                    <div style={s.dayRow}>
                      {DAYS_SHORT.map((d,i)=>(
                        <button key={i} style={{...s.dayBtn,...(parseInt(form.weekDay)===i?s.dayBtnActive:{})}} onClick={()=>setForm({...form,weekDay:i})}>{d}</button>
                      ))}
                    </div>
                  </div>
                )}
                <input style={s.input} placeholder="Pills remaining" type="number" value={form.pills} onChange={e=>setForm({...form,pills:e.target.value})}/>
                <div>
                  <p style={s.fieldLabel}>Colour</p>
                  <div style={s.colorRow}>
                    {COLORS.map(c=><div key={c} onClick={()=>setForm({...form,color:c})} style={{...s.colorDot,background:c,transform:form.color===c?"scale(1.25)":"scale(1)",boxShadow:form.color===c?`0 0 0 3px white, 0 0 0 5px ${c}`:"none"}}/>)}
                  </div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button style={{...s.saveBtn,background:form.color||COLORS[0],flex:1}} onClick={saveMedicine}>{editingId?"Save changes":"Add medicine"}</button>
                  {editingId&&<button style={s.cancelBtn} onClick={cancelForm}>Cancel</button>}
                </div>
                {editingId&&<button style={s.deleteFullBtn} onClick={()=>deleteMedicine(editingId)}>🗑 Delete this medicine</button>}
              </div>
            )}
            {medicines.map(med=>(
              <div key={med.id} style={{...s.medCard,borderLeft:`5px solid ${med.color}`}}>
                <div style={s.medCardTop}>
                  <div style={{...s.medIcon,background:med.color+"20",color:med.color}}>💊</div>
                  <div style={{flex:1}}>
                    <p style={s.medName}>{med.name}</p>
                    <p style={s.medDetails}>{med.dose} · {med.times.map(to12h).join(" & ")}</p>
                    <p style={{...s.medDetails,marginTop:2}}>{freqLabel(med)}</p>
                  </div>
                  <button style={{...s.editBtn,borderColor:med.color,color:med.color}} onClick={()=>{setShowForm(true);startEdit(med);}}>Edit</button>
                </div>
                <div style={s.medCardBottom}>
                  <span style={s.pillCount}>💉 {med.pillsRemaining} pills left</span>
                  <span style={s.pillCount}>~{med.pillsRemaining} days</span>
                </div>
              </div>
            ))}
            {medicines.length===0&&<p style={s.empty}>No medicines yet. Tap + Add to get started 💊</p>}
          </div>
        )}

        {tab==="hist"&&(
          <div style={s.scrollArea}>
            <div style={s.histHero}>
              <div style={s.histHeroGlow}/>
              <p style={s.histStreakNum}>{streak}</p>
              <p style={s.histStreakEmoji}>🔥</p>
              <p style={s.histStreakLabel}>day streak</p>
            </div>
            <p style={s.sectionLabel}>📅 Last 4 weeks</p>
            <div style={s.heatmapCard}>
              <div style={s.heatmapGrid}>
                {heatmap.map((v,i)=>(
                  <div key={i} style={{...s.heatCell,background:v==="full"?"#7C3AED":v==="partial"?"#F59E0B":v==="missed"?"#EF4444":"#ede9fe"}}/>
                ))}
              </div>
              <div style={s.heatmapDays}>{["S","M","T","W","T","F","S"].map((d,i)=><p key={i} style={s.dayLabel}>{d}</p>)}</div>
              <div style={s.legendRow}>
                {[["#7C3AED","All taken"],["#F59E0B","Partial"],["#EF4444","Missed"],["#ede9fe","None due"]].map(([c,l])=>(
                  <div key={l} style={s.legendItem}><div style={{width:10,height:10,borderRadius:3,background:c}}/><span style={s.legendText}>{l}</span></div>
                ))}
              </div>
            </div>
            <p style={s.sectionLabel}>📊 Adherence overall</p>
            {adherence.map(med=>(
              <div key={med.id} style={{...s.adherenceCard,borderLeft:`5px solid ${med.color}`}}>
                <div style={s.adherenceRow}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{...s.medIcon,background:med.color+"20",color:med.color,width:32,height:32,fontSize:14}}>💊</div>
                    <div>
                      <p style={{...s.medName,margin:0}}>{med.name}</p>
                      <p style={{...s.pillCount,margin:0}}>{freqLabel(med)}</p>
                    </div>
                  </div>
                  <div style={{...s.pctBadge,background:med.pct>=80?"#D1FAE5":med.pct>=50?"#FEF3C7":"#FEE2E2",color:med.pct>=80?"#065F46":med.pct>=50?"#92400E":"#991B1B"}}>{med.pct}%</div>
                </div>
                <div style={s.barBg}><div style={{...s.barFill,width:`${med.pct}%`,background:med.color}}/></div>
              </div>
            ))}
          </div>
        )}

        {tab==="settings"&&(
          <div style={s.scrollArea}>
            <div style={s.settingsHero}>
              <div style={s.heroGlow}/>
              <p style={s.heroGreeting}>Preferences</p>
              <p style={s.heroName}>Settings ⚙️</p>
            </div>
            <p style={s.sectionLabel}>🔔 Notifications</p>
            <div style={s.settingsCard}><NotifStatusCard/></div>
            {notifStatus==="granted"&&(
              <div style={s.settingsCard}>
                <p style={s.settingsCardTitle}>⏱ Remind me how early?</p>
                <p style={s.settingsCardBody}>Get a heads-up before each dose is due.</p>
                <div style={s.leadRow}>
                  {[[0,"At dose time"],[5,"5 min early"],[10,"10 min early"],[15,"15 min early"]].map(([mins,label])=>(
                    <button key={mins} style={{...s.leadBtn,...(notifLeadMins===mins?s.leadBtnActive:{})}} onClick={()=>handleLeadChange(mins)}>{label}</button>
                  ))}
                </div>
              </div>
            )}
            <p style={s.sectionLabel}>ℹ️ How it works</p>
            <div style={s.settingsCard}>
              <div style={s.howItWorksRow}>
                <div style={s.howStep}>
                  <div style={{...s.howIcon,background:"#EDE9FE"}}>📲</div>
                  <p style={s.howLabel}>Install as app</p>
                  <p style={s.howSub}>Safari → Share → Add to Home Screen</p>
                </div>
                <div style={s.howArrow}>→</div>
                <div style={s.howStep}>
                  <div style={{...s.howIcon,background:"#D1FAE5"}}>🔔</div>
                  <p style={s.howLabel}>Allow notifications</p>
                  <p style={s.howSub}>Tap Enable above</p>
                </div>
                <div style={s.howArrow}>→</div>
                <div style={s.howStep}>
                  <div style={{...s.howIcon,background:"#FEF3C7"}}>⏰</div>
                  <p style={s.howLabel}>Get reminders</p>
                  <p style={s.howSub}>Every dose, every day</p>
                </div>
              </div>
            </div>
            <p style={s.sectionLabel}>💜 About</p>
            <div style={s.settingsCard}>
              <p style={s.aboutTitle}>MediTrack</p>
              <p style={s.aboutSub}>Made with love for Ambika 💊✨</p>
              <p style={s.aboutSub}>All data is stored privately on this device.</p>
            </div>
          </div>
        )}

        <div style={s.tabBar}>
          {[
            {id:"today",label:"Today",icon:"📋"},
            {id:"meds",label:"Medicines",icon:"💊"},
            {id:"hist",label:"History",icon:"📊"},
            {id:"settings",label:"Settings",icon:"⚙️"},
          ].map(t=>(
            <button key={t.id} style={{...s.tabBtn,color:tab===t.id?"#7C3AED":"#aaa"}} onClick={()=>setTab(t.id)}>
              <span style={{fontSize:tab===t.id?22:18,transition:"font-size 0.15s"}}>{t.icon}</span>
              <span style={{fontSize:10,fontWeight:tab===t.id?600:400}}>{t.label}</span>
              {tab===t.id&&<div style={s.tabDot}/>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles = {
  app:{minHeight:"100vh",background:"#FAF5FF",display:"flex",justifyContent:"center",alignItems:"flex-start",fontFamily:"system-ui,sans-serif"},
  screen:{width:"100%",maxWidth:430,minHeight:"100vh",background:"#FAF5FF",display:"flex",flexDirection:"column",position:"relative"},
  scrollArea:{flex:1,overflowY:"auto",padding:"0 0 90px"},
  hero:{background:"linear-gradient(135deg,#7C3AED 0%,#DB2777 100%)",padding:"36px 20px 28px",position:"relative",overflow:"hidden"},
  heroGlow:{position:"absolute",top:-40,right:-40,width:180,height:180,borderRadius:"50%",background:"rgba(255,255,255,0.12)"},
  heroGreeting:{fontSize:14,color:"rgba(255,255,255,0.8)",margin:"0 0 2px",letterSpacing:"0.5px"},
  heroName:{fontSize:30,fontWeight:700,color:"#fff",margin:"0 0 6px",letterSpacing:"-0.5px"},
  heroDate:{fontSize:13,color:"rgba(255,255,255,0.75)",margin:0},
  streakPill:{display:"inline-block",marginTop:12,background:"rgba(255,255,255,0.2)",color:"#fff",padding:"5px 14px",borderRadius:20,fontSize:13,fontWeight:600},
  progressBox:{margin:"16px 16px 0",background:"#fff",borderRadius:14,padding:"14px 16px",border:"1px solid #ede9fe"},
  progressTop:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8},
  progressLabel:{fontSize:12,color:"#6B21A8",fontWeight:600},
  progressCount:{fontSize:13,color:"#6B7280"},
  progressTaken:{fontWeight:700,color:"#7C3AED"},
  progressBg:{height:8,background:"#ede9fe",borderRadius:99},
  progressFill:{height:8,background:"linear-gradient(90deg,#7C3AED,#DB2777)",borderRadius:99,transition:"width 0.5s"},
  timeLabel:{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.8px",margin:"18px 16px 8px"},
  doseCard:{background:"#fff",borderRadius:14,margin:"0 16px 10px",padding:"14px 14px 14px 12px",display:"flex",alignItems:"center",gap:12,boxShadow:"0 2px 8px rgba(124,58,237,0.07)"},
  doseCircle:{width:38,height:38,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0},
  doseInfo:{flex:1,minWidth:0},
  doseName:{fontSize:15,fontWeight:600,color:"#1a1a1a",margin:"0 0 2px"},
  doseDose:{fontSize:12,color:"#7C3AED",fontWeight:500,margin:"0 0 2px"},
  doseStatus:{fontSize:11,color:"#9CA3AF",margin:0},
  markBtn:{color:"#fff",border:"none",borderRadius:10,padding:"9px 12px",fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0,boxShadow:"0 2px 6px rgba(0,0,0,0.15)"},
  empty:{fontSize:14,color:"#bbb",textAlign:"center",marginTop:40,padding:"0 20px"},
  sectionDivider:{fontSize:12,fontWeight:700,color:"#7C3AED",margin:"24px 16px 10px",textTransform:"uppercase",letterSpacing:"0.6px"},
  medsHeader:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",padding:"24px 16px 16px"},
  medsTitle:{fontSize:22,fontWeight:700,color:"#1a1a1a",margin:"0 0 2px"},
  medsSubtitle:{fontSize:12,color:"#9CA3AF",margin:0},
  addBtn:{background:"linear-gradient(135deg,#7C3AED,#DB2777)",color:"#fff",border:"none",borderRadius:10,padding:"9px 18px",fontSize:13,fontWeight:600,cursor:"pointer",boxShadow:"0 3px 10px rgba(124,58,237,0.3)"},
  formCard:{background:"#fff",borderRadius:16,border:"1.5px solid #ede9fe",padding:18,margin:"0 16px 16px",display:"flex",flexDirection:"column",gap:12,boxShadow:"0 4px 20px rgba(124,58,237,0.1)"},
  formTitle:{fontSize:16,fontWeight:700,color:"#7C3AED",margin:0},
  input:{border:"1.5px solid #ede9fe",borderRadius:10,padding:"11px 14px",fontSize:14,outline:"none",background:"#FAF5FF",fontFamily:"system-ui,sans-serif",color:"#1a1a1a"},
  fieldLabel:{fontSize:11,fontWeight:700,color:"#7C3AED",margin:"0 0 6px",textTransform:"uppercase",letterSpacing:"0.4px"},
  freqRow:{display:"flex",gap:6},
  freqBtn:{flex:1,padding:"9px 4px",border:"1.5px solid #ede9fe",borderRadius:10,background:"#FAF5FF",fontSize:12,color:"#555",cursor:"pointer",fontFamily:"system-ui,sans-serif"},
  freqBtnActive:{background:"#EDE9FE",borderColor:"#7C3AED",color:"#7C3AED",fontWeight:700},
  dayRow:{display:"flex",gap:4},
  dayBtn:{flex:1,padding:"7px 2px",border:"1.5px solid #ede9fe",borderRadius:8,background:"#FAF5FF",fontSize:10,color:"#555",cursor:"pointer",fontFamily:"system-ui,sans-serif"},
  dayBtnActive:{background:"#EDE9FE",borderColor:"#7C3AED",color:"#7C3AED",fontWeight:700},
  colorRow:{display:"flex",gap:10,flexWrap:"wrap"},
  colorDot:{width:28,height:28,borderRadius:"50%",cursor:"pointer",transition:"transform 0.15s, box-shadow 0.15s"},
  saveBtn:{color:"#fff",border:"none",borderRadius:10,padding:"12px",fontSize:14,fontWeight:700,cursor:"pointer",boxShadow:"0 3px 10px rgba(0,0,0,0.2)"},
  cancelBtn:{background:"#f3f4f6",color:"#555",border:"none",borderRadius:10,padding:"12px 16px",fontSize:14,cursor:"pointer"},
  deleteFullBtn:{background:"none",border:"1.5px solid #FCA5A5",borderRadius:10,padding:"10px",fontSize:13,color:"#EF4444",cursor:"pointer",fontWeight:500},
  medCard:{background:"#fff",borderRadius:14,margin:"0 16px 10px",boxShadow:"0 2px 10px rgba(124,58,237,0.08)"},
  medCardTop:{display:"flex",alignItems:"flex-start",gap:10,padding:"14px 14px 10px"},
  medCardBottom:{display:"flex",justifyContent:"space-between",padding:"10px 14px 14px",borderTop:"1px solid #FAF5FF"},
  medIcon:{width:38,height:38,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0},
  medName:{fontSize:15,fontWeight:600,color:"#1a1a1a",margin:"0 0 2px"},
  medDetails:{fontSize:12,color:"#9CA3AF",margin:0},
  pillCount:{fontSize:11,color:"#A78BFA"},
  editBtn:{background:"none",borderRadius:8,padding:"5px 12px",fontSize:12,fontWeight:600,cursor:"pointer",border:"1.5px solid"},
  histHero:{background:"linear-gradient(135deg,#7C3AED 0%,#DB2777 100%)",padding:"36px 20px 32px",textAlign:"center",position:"relative",overflow:"hidden"},
  histHeroGlow:{position:"absolute",top:-60,left:"50%",transform:"translateX(-50%)",width:250,height:250,borderRadius:"50%",background:"rgba(255,255,255,0.1)"},
  histStreakNum:{fontSize:64,fontWeight:800,color:"#fff",margin:0,lineHeight:1},
  histStreakEmoji:{fontSize:32,margin:"4px 0"},
  histStreakLabel:{fontSize:14,color:"rgba(255,255,255,0.8)",margin:0,fontWeight:500},
  sectionLabel:{fontSize:12,fontWeight:700,color:"#7C3AED",margin:"20px 16px 10px",letterSpacing:"0.5px"},
  heatmapCard:{background:"#fff",borderRadius:14,margin:"0 16px",padding:16,boxShadow:"0 2px 10px rgba(124,58,237,0.08)"},
  heatmapGrid:{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:5,marginBottom:6},
  heatCell:{aspectRatio:"1",borderRadius:4},
  heatmapDays:{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:5,marginBottom:10},
  dayLabel:{fontSize:9,color:"#A78BFA",textAlign:"center",margin:0,fontWeight:600},
  legendRow:{display:"flex",gap:10,flexWrap:"wrap"},
  legendItem:{display:"flex",alignItems:"center",gap:4},
  legendText:{fontSize:10,color:"#9CA3AF"},
  adherenceCard:{background:"#fff",borderRadius:14,margin:"0 16px 10px",padding:14,boxShadow:"0 2px 10px rgba(124,58,237,0.08)"},
  adherenceRow:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10},
  pctBadge:{padding:"4px 10px",borderRadius:20,fontSize:13,fontWeight:700},
  barBg:{height:6,background:"#EDE9FE",borderRadius:99},
  barFill:{height:6,borderRadius:99,transition:"width 0.5s"},
  settingsHero:{background:"linear-gradient(135deg,#7C3AED 0%,#DB2777 100%)",padding:"36px 20px 28px",position:"relative",overflow:"hidden"},
  settingsCard:{background:"#fff",borderRadius:14,margin:"0 16px 12px",padding:16,boxShadow:"0 2px 10px rgba(124,58,237,0.08)"},
  settingsCardTitle:{fontSize:15,fontWeight:600,color:"#1a1a1a",margin:"0 0 4px"},
  settingsCardBody:{fontSize:13,color:"#6B7280",margin:"0 0 12px"},
  notifCard:{display:"flex",gap:14,alignItems:"flex-start",border:"1.5px solid",borderRadius:12,padding:14},
  notifCardTitle:{fontSize:15,fontWeight:700,color:"#1a1a1a",margin:"0 0 4px"},
  notifCardBody:{fontSize:13,color:"#6B7280",margin:"0 0 12px",lineHeight:1.5},
  enableBtn:{background:"linear-gradient(135deg,#7C3AED,#DB2777)",color:"#fff",border:"none",borderRadius:10,padding:"10px 18px",fontSize:14,fontWeight:600,cursor:"pointer",boxShadow:"0 3px 10px rgba(124,58,237,0.3)"},
  testBtn:{background:"#EDE9FE",color:"#7C3AED",border:"none",borderRadius:10,padding:"8px 16px",fontSize:13,fontWeight:600,cursor:"pointer"},
  leadRow:{display:"flex",flexWrap:"wrap",gap:8},
  leadBtn:{padding:"8px 14px",border:"1.5px solid #ede9fe",borderRadius:10,background:"#FAF5FF",fontSize:12,color:"#555",cursor:"pointer",fontFamily:"system-ui,sans-serif"},
  leadBtnActive:{background:"#EDE9FE",borderColor:"#7C3AED",color:"#7C3AED",fontWeight:700},
  howItWorksRow:{display:"flex",alignItems:"flex-start",gap:8,marginBottom:14},
  howStep:{flex:1,textAlign:"center"},
  howIcon:{width:40,height:40,borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,margin:"0 auto 6px"},
  howLabel:{fontSize:12,fontWeight:600,color:"#1a1a1a",margin:"0 0 2px"},
  howSub:{fontSize:10,color:"#9CA3AF",margin:0,lineHeight:1.4},
  howArrow:{fontSize:16,color:"#C4B5FD",paddingTop:12},
  aboutTitle:{fontSize:18,fontWeight:700,color:"#7C3AED",margin:"0 0 4px"},
  aboutSub:{fontSize:13,color:"#9CA3AF",margin:"0 0 4px"},
  tabBar:{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:430,height:68,background:"#fff",borderTop:"1px solid #ede9fe",display:"flex",boxShadow:"0 -4px 20px rgba(124,58,237,0.1)"},
  tabBtn:{flex:1,border:"none",background:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,fontFamily:"system-ui,sans-serif",position:"relative"},
  tabDot:{position:"absolute",bottom:6,width:4,height:4,borderRadius:"50%",background:"#7C3AED"},
};
