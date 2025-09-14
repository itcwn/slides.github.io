document.addEventListener('DOMContentLoaded',()=>{
  const slideEl=document.getElementById('slide');
  const counter=document.getElementById('counter');
  const prevBtn=document.getElementById('prevBtn');
  const nextBtn=document.getElementById('nextBtn');
  const playBtn=document.getElementById('playBtn');
  const pauseBtn=document.getElementById('pauseBtn');
  const startBtn=document.getElementById('startBtn');
  const browseBtn=document.getElementById('browseBtn');
  const fsPrompt=document.getElementById('fsPrompt');
  const settingsBtn=document.getElementById('settingsBtn');
  const settingsModal=document.getElementById('settingsModal');
  const closeSettingsBtn=document.getElementById('closeSettingsBtn');
  const marginPct=document.getElementById('marginPct');
  const marginVal=document.getElementById('marginVal');
  const intervalSec=document.getElementById('intervalSec');
  const sortBy=document.getElementById('sortBy');
  const sortDir=document.getElementById('sortDir');
  const saveSettingsBtn=document.getElementById('saveSettingsBtn');
  const resetSettingsBtn=document.getElementById('resetSettingsBtn');
  const catalogBtn=document.getElementById('catalogBtn');
  const catalogModal=document.getElementById('catalogModal');
  const closeCatalogBtn=document.getElementById('closeCatalogBtn');
  const catalogContent=document.getElementById('catalogContent');
  const audioBtn=document.getElementById('audioBtn');
  const bgAudio=document.getElementById('bgAudio');

  let slides=['01.jpg','02.jpg','03.jpg'];
  let index=0; let timer=null;

  function show(i){index=(i+slides.length)%slides.length;slideEl.src=slides[index];counter.textContent=`${index+1}/${slides.length}`;}
  function next(){show(index+1);} function prev(){show(index-1);}
  function play(){timer=setInterval(next,parseInt(intervalSec.value,10)*1000);} 
  function pause(){clearInterval(timer);}

  prevBtn.addEventListener('click',prev);
  nextBtn.addEventListener('click',next);
  playBtn.addEventListener('click',()=>{play();});
  pauseBtn.addEventListener('click',()=>{pause();});

  startBtn.addEventListener('click',()=>{fsPrompt.classList.add('hidden');document.documentElement.requestFullscreen?.();});
  browseBtn.addEventListener('click',()=>{catalogModal.classList.remove('hidden');});
  closeCatalogBtn.addEventListener('click',()=>{catalogModal.classList.add('hidden');});

  settingsBtn.addEventListener('click',()=>{settingsModal.classList.remove('hidden');});
  closeSettingsBtn.addEventListener('click',()=>{settingsModal.classList.add('hidden');});
  saveSettingsBtn.addEventListener('click',()=>{settingsModal.classList.add('hidden');});
  resetSettingsBtn.addEventListener('click',()=>{marginPct.value=5;marginVal.textContent='5%';});

  marginPct.addEventListener('input',()=>{marginVal.textContent=marginPct.value+'%';});
  audioBtn.addEventListener('click',()=>{if(bgAudio.paused){bgAudio.play();}else{bgAudio.pause();}});

  show(0);
});
