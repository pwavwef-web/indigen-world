import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
export function useListMemory<T extends string>(key: string, fallback: T, allowed?: readonly string[], override?: T): [T, Dispatch<SetStateAction<T>>] {
  const [value,setValue]=useState<T>(()=>{if(override!==undefined)return override;try{const stored=sessionStorage.getItem(key);return stored!==null&&(!allowed||allowed.includes(stored))?stored as T:fallback;}catch{return fallback;}});
  useEffect(()=>{try{sessionStorage.setItem(key,value);}catch{}},[key,value]);
  useEffect(()=>{if(override!==undefined)setValue(override);},[override]);
  return [value,setValue];
}
export function useListScroll(key: string, ready: boolean, active=true, selector?: string) {
  const restored=useRef(false);
  useLayoutEffect(()=>{
    if(!ready||!active)return;
    const target=selector?document.querySelector<HTMLElement>(selector):null;
    const read=()=>target?target.scrollTop:window.scrollY;
    const write=(top:number)=>target?target.scrollTo(0,top):window.scrollTo(0,top);
    let frame=requestAnimationFrame(()=>{try{write(Number(sessionStorage.getItem(key)||0));}catch{}restored.current=true;});
    const save=()=>{if(restored.current)try{sessionStorage.setItem(key,String(read()));}catch{}};
    const beforeNavigate=(event:Event)=>{save();restored.current=false;queueMicrotask(()=>{if(event.defaultPrevented)restored.current=true;});};
    window.addEventListener('studio:before-navigate',beforeNavigate);
    const source=target??window;source.addEventListener('scroll',save,{passive:true});
    return()=>{cancelAnimationFrame(frame);window.removeEventListener('studio:before-navigate',beforeNavigate);source.removeEventListener('scroll',save);restored.current=false;};
  },[key,ready,active,selector]);
}
