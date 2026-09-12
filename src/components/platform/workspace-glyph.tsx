import type {CSSProperties} from 'react';
import g from './workspace-glyph.module.css';

type Kind = 'data' | 'compute' | 'inference' | 'verification' | 'storage' | 'agents' | 'economy' | 'evidence';
const colors: Record<Kind, string> = {data:'#e0ece9',compute:'#e5e9f4',inference:'#f4dfd4',verification:'#e9ecd7',storage:'#e9e2ee',agents:'#e5e9f4',economy:'#e0ece9',evidence:'#e9ecd7'};
/** Decorative, flat symbols. Their geometry does not encode measurements or process status. */
export function WorkspaceGlyph({kind='agents',compact=false}:{kind?:string;compact?:boolean}) {
 const k=(kind in colors?kind:'agents') as Kind;
 return <svg className={`${g.glyph} ${compact?g.compact:''}`} style={{'--glyph-surface':colors[k]} as CSSProperties} viewBox="0 0 160 120" fill="none" aria-hidden="true" focusable="false">
  <rect x="1" y="1" width="158" height="118" rx="20" fill="var(--glyph-surface)"/>
  <g stroke="#292c2b" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
   {k==='data'?<><rect x="42" y="24" width="68" height="77" rx="8" fill="#fffdf9"/><path d="M56 42h36M56 55h24M56 68h13"/><circle cx="106" cy="82" r="18" fill="#b8d3c6"/><path d="m119 96 9 9M101 82h10M106 77v10"/></>:k==='compute'?<><rect x="45" y="25" width="70" height="70" rx="12" fill="#fffdf9"/><rect x="60" y="40" width="40" height="40" rx="4" fill="#bdc9ea"/>{[55,80,105].map(x=><path key={x} d={`M${x} 14v11M${x} 95v11`}/>)}{[35,60,85].map(y=><path key={y} d={`M34 ${y}h11M115 ${y}h11`}/>)}<path d="m75 50-7 10 7 10m10-20 7 10-7 10"/></>:k==='inference'?<><path d="M36 30h87v58H78L60 103V88H36z" fill="#fffdf9"/><path d="m78 43 5 13 14 4-14 5-5 13-5-13-13-5 13-4z" fill="#edaa8b"/><path d="M111 41v10m-5-5h10M47 71v9m-4-4h8"/></>:k==='verification'||k==='evidence'?<><path d="M80 19 116 32v28c0 23-21 35-36 43-15-8-36-20-36-43V32z" fill="#fffdf9"/><circle cx="80" cy="58" r="21" fill="#cbd3a2"/><path d="m69 58 8 8 15-17M24 53h8m96 22h9"/></>:k==='storage'?<><rect x="36" y="31" width="88" height="66" rx="8" fill="#fffdf9"/><path d="M31 25h98v20H31z" fill="#cdbbd9"/><path d="M66 60h28v12H66zM51 86h23"/></>:k==='economy'?<><path d="M31 78V38h94v40M47 78h61"/><circle cx="31" cy="78" r="19" fill="#fffdf9"/><circle cx="80" cy="38" r="22" fill="#b8d3c6"/><rect x="109" y="62" width="32" height="32" rx="9" fill="#edaa8b"/><path d="m120 72 9 6-9 6M80 26v24m7-20H77a5 5 0 0 0 0 10h6a5 5 0 0 1 0 10H73M24 78h14"/></>:<><path d="M44 71h71M80 34v37"/><rect x="55" y="18" width="50" height="35" rx="10" fill="#fffdf9"/><path d="M70 32v7m20-7v7M80 10v8"/><rect x="20" y="65" width="48" height="35" rx="10" fill="#bdc9ea"/><rect x="92" y="65" width="48" height="35" rx="10" fill="#edaa8b"/><path d="M34 79v7m19-7v7m53-7v7m19-7v7"/></>}
  </g>
 </svg>;
}
