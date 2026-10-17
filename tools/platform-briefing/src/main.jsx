import React from 'react';
import { createRoot } from 'react-dom/client';
import { Player } from '@remotion/player';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import summary from './briefing-data.json';

const ink='#f5f0df',gold='#eabf66',muted='#aec7bd';
function Briefing() {
 const frame=useCurrentFrame(); const {fps}=useVideoConfig();
 const chapter=Math.min(4,Math.floor(frame/(9*fps)));
 const local=frame-chapter*9*fps;
 const scene=summary.scenes[chapter];
 return <AbsoluteFill style={{background:'#153d36',color:ink,fontFamily:'Segoe UI, Arial, sans-serif',padding:60,boxSizing:'border-box'}}>
  <div style={{position:'absolute',width:620,height:620,border:'1px solid #eabf6627',borderRadius:'50%',right:-190,top:-310}}/>
  <div style={{display:'flex',justifyContent:'space-between',fontSize:17,color:muted,letterSpacing:3}}><span>INDIGEN WORLD</span><span>15 OCT 2026 · REPOSITORY REVIEW</span></div>
  <div style={{marginTop:38,opacity:chapter===0?1:interpolate(local,[0,.6*fps],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})}}>
   <div style={{fontSize:17,color:gold,marginBottom:16}}>0{chapter+1} / 05</div>
   <div style={{fontSize:52,lineHeight:1.1,fontWeight:650,maxWidth:970,letterSpacing:-1}}>{scene.title}</div>
   <div style={{fontSize:24,lineHeight:1.45,color:muted,maxWidth:940,marginTop:22}}>{scene.body}</div>
  </div>
  <div style={{display:'flex',gap:16,marginTop:38,flexWrap:'wrap'}}>{scene.items.map((item,i)=><div key={item} style={{flex:'1 1 140px',borderTop:'2px solid '+(i%2?gold:'#77b89c'),paddingTop:15,fontSize:21,lineHeight:1.3,opacity:chapter===0?1:interpolate(local,[(.6+i*.2)*fps,(1+i*.2)*fps],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'}),translate:`0 ${chapter===0?0:interpolate(local,[(.6+i*.2)*fps,(1+i*.2)*fps],[12,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})}px`}}>{item}</div>)}</div>
  <div style={{position:'absolute',bottom:42,left:60,right:60,fontSize:15,color:muted,display:'flex',gap:25,alignItems:'center'}}><span style={{flex:1}}>{scene.limit}</span><span style={{whiteSpace:'nowrap'}}>Explanatory animation · No live metrics</span></div>
  <div style={{position:'absolute',bottom:0,left:0,height:5,width:interpolate(frame,[0,45*fps],[0,100])+'%',background:gold}}/>
 </AbsoluteFill>;
}
function App(){
 const ref=React.useRef(null);
 return <div><Player ref={ref} component={Briefing} durationInFrames={45*30} fps={30} compositionWidth={1280} compositionHeight={720} controls clickToPlay showVolumeControls={false} style={{width:'100%',borderRadius:12,overflow:'hidden'}}/><div className="chapters">{summary.scenes.map((s,i)=><button key={s.title} onClick={()=>ref.current?.seekTo(i===0?0:i*9*30+54)}>{i+1}. {s.label}</button>)}</div></div>;
}
createRoot(document.getElementById('root')).render(<App/>);
