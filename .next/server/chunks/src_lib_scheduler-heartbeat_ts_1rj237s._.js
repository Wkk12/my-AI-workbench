module.exports=[33604,t=>{"use strict";let e=!1;t.s(["schedulerHeartbeat",0,function(){if(e)return;e=!0;let t=process.env.PORT||"3000",s=`http://localhost:${t}`;async function r(){try{await fetch(`${s}/api/scheduler/run`,{signal:AbortSignal.timeout(25e3)})}catch{}}setTimeout(()=>{r(),setInterval(r,3e4)},5e3)}])}];

//# sourceMappingURL=src_lib_scheduler-heartbeat_ts_1rj237s._.js.map