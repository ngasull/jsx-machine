import{isFunction as g}from"/.js/@classic/js/dom/util.js";import{call as h,dispatchPrevented as b,eventType as S,forEach as A,listen as E,reverseForOf as k,stopPropagation as x}from"/.js/@classic/js/dom/util.js";var O=S({type:"lf-t"}),L=S({type:"lf-u"});var v=(e,t)=>{b(e,O(t))};import{call as c,entries as J,forEach as a,isFunction as R}from"/.js/@classic/js/dom/util.js";var s={},u={peek:e=>s[e]?.[0],sub:(e,t)=>(a(e,r=>(s[r]??=[void 0,new Set])[1].add(t)),()=>a(e,r=>s[r][1].delete(t))),set:e=>{let t=new Set,r=[],n=(o,i)=>{let p=0,l=s[o]??=[void 0,new Set],f=l[0];return i!==f&&(l[0]=i,a(l[1],N=>t.add(N)),r.push(()=>{l[0]===i&&n(o,f)}),p=1),i===void 0&&delete s[o],p};return a(J(e),([o,i])=>n(o,R(i)?i(u.peek(o)):i)),a(t,c),()=>{t=new Set,a(r,c),a(t,c)}}};var d,U=(e,t,r)=>{for(d=0;d<t;d++)e=e.previousSibling;return d=0,y(e,r)},y=(e,t)=>t.flatMap(([r,n])=>{for(;d<r;d++)e=e.nextSibling;return n?y(e.firstChild,n):e}),I=(e,t,r)=>{let n=t(),o=r&&u.sub(r,()=>{g(n)&&n(),n=t()});v(e,()=>{o?.(),g(n)&&n()})};export{U as refs,u as store,I as sub};
//# sourceMappingURL=dom.js.map