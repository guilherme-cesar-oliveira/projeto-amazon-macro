import dotenv from 'dotenv';
dotenv.config();

let grant_type = process.env.GRANT_TYPE
let client_id = process.env.CLIENT_ID
let client_secret = process.env.CLIENT_SECRET
let refresh_token = process.env.REFRESH_TOKEN

let az_token;

export async function GetTokenAmazon(){

    const myHeaders = new Headers();
    myHeaders.append("Content-Type", "application/x-www-form-urlencoded");

    const urlencoded = new URLSearchParams();
    urlencoded.append("grant_type", grant_type);
    urlencoded.append("client_id", client_id);
    urlencoded.append("client_secret", client_secret);
    urlencoded.append("refresh_token", refresh_token);

    const requestOptions = {
    method: "POST",
    headers: myHeaders,
    body: urlencoded,
    redirect: "follow"
    };

    return fetch("https://api.amazon.com/auth/o2/token", requestOptions)
    .then((response) => response.json())
    .then((result) => result)
    .catch((error) => console.error(error));

}

export async function GetProductById(ean){

    const myHeaders = new Headers();
    myHeaders.append("x-amz-access-token", az_token);
    myHeaders.append("Authorization", `Bearer ${az_token}`);
        
    const requestOptions = {
      method: "GET",
      headers: myHeaders,
      redirect: "follow"
    };
    
   return fetch(`https://sellingpartnerapi-na.amazon.com/catalog/2022-04-01/items?marketplaceIds=A2Q3Y263D00KWC&locale=pt_BR&identifiers=${ean}&identifiersType=EAN`, requestOptions)
      .then((response) => response.json())
      .then((result) => result)
      .catch((error) => console.error(error));

}

async function updateAzToken() {
    try {
        let azTokenData = await GetTokenAmazon();
        if (azTokenData && azTokenData.access_token) {
            az_token = azTokenData.access_token;
            console.log("Token da Amazon atualizado");
        } else {
            console.error("Erro: Token da Amazon não encontrado.");
        }
    } catch (error) {
        console.error("Erro ao atualizar o token da Amazon:", error);
    }
}

//---------------Inicio do bloco de rotinas-------------------//
//Executa as rotinas que mantem os token da amazon e do meli funcionando.

// Executa a primeira vez ao iniciar
updateAzToken();

// Atualiza a cada 40 minutos (40 * 60 * 1000 milissegundos)
setInterval(updateAzToken, 40 * 60 * 1000);

//-----------------Fim do bloco de rotinas-----------------------//