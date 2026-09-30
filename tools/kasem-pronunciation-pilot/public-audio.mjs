// Retrying a read cannot create a duplicate upload or dictionary edit.
export async function downloadPublicAudio(url) {
  for(let attempt=0;attempt<4;attempt++) {
    try {
      const response=await fetch(url,{headers:{Connection:'close'},signal:AbortSignal.timeout(30000)});
      if(!response.ok)throw Error(`Public audio HTTP ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } catch(error) {if(attempt===3)throw error;}
  }
}
