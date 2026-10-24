export const steps=["Welcome","Sign in","Connect this computer","Discover printers","Select a printer","Printer settings","Review prices","Customer QR code","Open dashboard"];
export function el(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
export function card(title,copy){const node=el("div",undefined,"card");node.append(el("h3",title),el("p",copy));return node;}
export function heading(eyebrow,title,copy){const f=document.createDocumentFragment();f.append(el("p",eyebrow,"eyebrow"),el("h2",title),el("p",copy,"lead"));return f;}
export function blocked(title,copy){const node=el("div",undefined,"pairing");node.append(el("h3",title),el("p",copy));return node;}
