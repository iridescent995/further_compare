'use strict';
const HOUR_NS=3600000000000n;
const abs=value=>value<0n?-value:value;
// Callers validate rules at their boundary. Retain nanosecond precision and raw
// timestamps: these exceptions affect equality, never ordering or file metadata.
function timestampsEqualNs(a,b,rules={}) {
 const delta=abs(BigInt(a)-BigInt(b));
 const tolerance=BigInt(rules.timeToleranceMs??0)*1000000n;
 if(delta<=tolerance)return true;
 if(rules.ignoreTimezone){
  const remainder=delta%HOUR_NS;
  return (remainder<HOUR_NS-remainder?remainder:HOUR_NS-remainder)<=tolerance;
 }
 return Boolean(rules.ignoreDaylightSaving)&&abs(delta-HOUR_NS)<=tolerance;
}
module.exports={timestampsEqualNs};
