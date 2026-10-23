'use strict';
// Excel dates are floating calendar values, not local-time instants. Z preserves
// the existing table representation convention without consulting local timezone.
const DAY_SECONDS=86400n,DAY_MS=86400000;
const fail=()=>{throw Error('Workbook date: unsupported serial or date system.');};
function exactDaySeconds(serial,day){
 const bits=new DataView(new ArrayBuffer(8));bits.setFloat64(0,serial,false);const raw=bits.getBigUint64(0,false),encodedExponent=Number((raw>>52n)&2047n),fraction=raw&((1n<<52n)-1n);
 let numerator=encodedExponent?(1n<<52n)|fraction:fraction;const exponent=encodedExponent?encodedExponent-1075:-1074;
 let denominator=1n;if(exponent>=0)numerator<<=BigInt(exponent);else denominator<<=BigInt(-exponent);
 const seconds=(numerator-BigInt(day)*denominator)*DAY_SECONDS,whole=Number(seconds/denominator),remainder=seconds%denominator;
 if(!remainder)return {whole,fraction:'000'};
 // denominator is a power of two. Its exact decimal representation terminates
 // within 1,074 places, including subnormal doubles; no precision is discarded.
 const places=exponent<0?-exponent:0;
 const decimal=(remainder*5n**BigInt(places)).toString().padStart(places,'0').replace(/0+$/,'');
 return {whole,fraction:decimal};
}
function formatWorkbookDateSerial(serial,{date1904=false}={}){
 if(typeof serial!=='number'||!Number.isFinite(serial)||serial<0||typeof date1904!=='boolean'||serial>=(date1904?2957004:2958466))fail();
 const day=Math.floor(serial),milliseconds=(serial-day)*DAY_MS,nearest=Math.round(milliseconds);
 // Normalize an intended millisecond only if it reconstructs the exact source
 // double. Unlike tolerance-based rounding this cannot collapse adjacent caches.
 const exactMillisecond=nearest<DAY_MS&&day+nearest/DAY_MS===serial;
 const pad=(n,size=2)=>String(n).padStart(size,'0');
 const time=exactMillisecond?{whole:Math.floor(nearest/1000),fraction:pad(nearest%1000,3)}:exactDaySeconds(serial,day);
 const clock=`${pad(Math.floor(time.whole/3600))}:${pad(Math.floor(time.whole/60)%60)}:${pad(time.whole%60)}.${time.fraction}`;
 if(!date1904&&(day===0||day===60))return `${day===0?'1900-01-00':'1900-02-29'}T${clock} [Excel 1900 ${day===0?'zero day':'fictional leap day'}]`;
 const epochDays=day-(date1904?24107:day<60?25568:25569),date=new Date(epochDays*DAY_MS).toISOString().slice(0,10);
 return `${date}T${clock}Z`;
}
module.exports={formatWorkbookDateSerial};
