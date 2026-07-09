export async function register(){
    if(process.env.NEXT_RUNTIME === 'nodejs'){
      const {register: validateEnv} = await import('@video-streaming/config/instrumentation')
      await validateEnv();
    }
  }