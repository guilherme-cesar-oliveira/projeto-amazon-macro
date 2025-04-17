import dotenv from 'dotenv';

dotenv.config();


let apiKey = process.env.OPENAI_API_KEY
let model = process.env.MODEL
let temperature = process.env.TEMPERATURE
let max_completion_tokens = process.env.MAX_COMPLETION_TOKENS
let top_p = process.env.TOP_P
let frequency_penalty = process.env.FREQUENCY_PENALTY
let presence_penalty = process.env.PRESENCE_PENALTY
let n = process.env.N
let store = process.env.STORE

let time_out_max = 40000

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const tokenManager_description = {
    remainingTokens: null,
    resetTime: null,
    lock: false,
};
  
const description_initial_instructions = `Vc ira receber um json contendo as seguintes informações: nome do produto, descrição do produto, marca, gtin, comprimento, largura, altura e peso.

Com os seus conhecimentos sobre varios tipos de produtos, preciso que a partir das informações recebidas, vc crie uma descrição, que será usada como prompt para gerar uma descrição mais detalhada e completa.

A descrição deve resumir de forma simples e objetiva o produto, de forma a ser usada como descrição do produto na Amazon.

A descrição deve ser em português brasileiro.

Junto da descrição, vc deve criar um nome para o produto, de forma a ser usado como nome do produto na Amazon.

O nome do produto deve ser atraente e de fácil compreensão pelo cliente.

Assim como definir o tipo do produto, de forma a ser usado como tipo do produto na Amazon.

O formato da resposta deve ser um json com as seguintes informações:

{
    \"tipo_do_produto\": \"tipo do produto\",
    \"descrição\": \"descrição do produto\",
    \"nome\": \"nome do produto\"
}`


let description_completation_configs = {
    model: model,
    temperature: parseFloat(temperature),
    max_completion_tokens: parseFloat(max_completion_tokens),
    top_p: parseFloat(top_p),
    frequency_penalty: parseFloat(frequency_penalty),
    presence_penalty: parseFloat(presence_penalty),
    n: parseFloat(n),
    store: store
}

description_completation_configs.store = description_completation_configs.store === 'true'; // true

function parseResetTime(resetTime) {
    const timeInSeconds = parseFloat(resetTime.replace('s', ''));
    return timeInSeconds * 1000; // Retorna o tempo em milissegundos
}

export async function format_description(description) {

    description = description.replace(/"/g, "'");

    while(tokenManager_description.lock == true){
        console.log('Aguardando liberação de tokens...')
        await sleep(tokenManager_description.resetTime)
    }

  const url = "https://api.openai.com/v1/chat/completions";

  const storeAsBool = description_completation_configs.store === 'true'; // true

  const body = {
      model: description_completation_configs.model,
      messages: [
          {
              role: "system",
              content: [
                  {
                      type: "text",
                      text: description_initial_instructions
                  }
              ]
          },
          {
              role: "user",
              content: [
                  {
                      type: "text",
                      text: description
                  }
              ]
          }
      ],
      response_format: { type: "json_object" },
      temperature:description_completation_configs.temperature,
      max_completion_tokens: description_completation_configs.max_completion_tokens,
      top_p: description_completation_configs.top_p,
      frequency_penalty:description_completation_configs.frequency_penalty,
      presence_penalty: description_completation_configs.presence_penalty,
      n: description_completation_configs.n,
      store: storeAsBool
      };

  try {
      const response = await fetch(url, {
          method: "POST",
          headers: {
              "Authorization": `Bearer ${apiKey}`,
              "Content-Type": "application/json"
          },
          body: JSON.stringify(body)
      });

      // ✅ Verifica se a resposta da API está OK (200-299)
      if (!response.ok) {
          throw new Error(`Erro na API: ${response.status} - ${response.statusText}`);
      }

      // ✅ Captura os headers importantes para monitoramento
      const headers = response.headers;

      // ✅ Converte a resposta para JSON
      const data = await response.json();
      // ✅ Aguarda o limite de tokens por minuto antes da próxima requisição
      await tpm_gpt_per_model_limit(headers, 'description');

      console.log('Descrição Formatada')
      // ✅ Retorna a mensagem formatada corretamente
      return data.choices[0].message.content;

  } catch (error) {
      console.error("Erro ao chamar a OpenAI:", error);
      throw error;
  }
}

async function tpm_gpt_per_model_limit(headers, origem) {

    let Mananger
    if(origem == 'description'){
        Mananger = tokenManager_description
    }else if(origem == 'for_amazon'){
        Mananger = tokenManager_for_amazon      
    }

  // Acessando os headers corretamente usando .get()
  const remainingTokens = headers.get('x-ratelimit-remaining-tokens');
  const resetTime = headers.get('x-ratelimit-reset-tokens');
  const limit_tokens =  headers.get('x-ratelimit-limit-tokens');


  // Processando os valores
  Mananger.remainingTokens = parseInt(remainingTokens, 10);
  Mananger.resetTime = parseResetTime(resetTime); // Função para converter o tempo de reset, você precisa implementá-la 
  Mananger.limit_tokens = parseInt(limit_tokens, 10)

  // Se os tokens restantes forem inferiores ao limite de TPM, aguarda o reset
  if (Mananger.remainingTokens < (Mananger.limit_tokens * 0.25)) {
        Mananger.lock = true;
      console.log(`Tokens insuficientes. Aguardando ${Mananger.resetTime / 1000} segundos...`);

      // Timeout de segurança para evitar travamento
      const timeout = time_out_max; // 30 segundos como timeout máximo
      const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout alcançado para espera de rate limit.')), timeout)
      );

      // Aguardando até o reset ou até o timeout
      try {
          await Promise.race([
              new Promise(resolve => setTimeout(resolve, Mananger.resetTime)), // Aguardar até o reset
              timeoutPromise // Timeout máximo
          ]);
      } catch (error) {
          console.error("Limite de timeout maximo atingindo, continuando execução.");
          Mananger.lock = false; // Garantir que o lock seja liberado
          return; // Interrompe a execução
      }

      Mananger.lock = false;
  }
}