export function downloadCsv(name:string, rows:(string|number|null)[][]) {
  const lines=rows.map(row=>row.map(value=>{
    let text=String(value??"");
    if(typeof value==="string" && /^\s*[=+@-]/.test(text)) text="'"+text;
    return '"'+text.replaceAll('"','""')+'"';
  }).join(","));
  const url=URL.createObjectURL(new Blob(["\uFEFF",lines.join("\r\n")],{type:"text/csv;charset=utf-8"}));
  const link=document.createElement("a");
  link.href=url;
  link.download=name+".csv";
  link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
