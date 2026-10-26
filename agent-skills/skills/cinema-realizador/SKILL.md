---
name: cinema-realizador
description: Usa para qualquer pedido de filmes ou séries nesta casa — sugerir o que ver (tendências, populares, recomendações, onde está a dar em streaming), pedir no Seerr, ver onde parou um pedido, mudar a qualidade (perfil do Radarr), legendas, aprovar ou apagar. As regras do Filipe para o que entra na biblioteca.
---

# Cinema — as regras da casa

A casa chama **Seerr** ao Overseerr (as ferramentas chamam-se `media.overseerr_*`). Pedidos entram pelo Seerr; o Radarr (filmes) e o Sonarr (séries) vão buscar; o Plex mostra.

## O que entra na biblioteca (regras do Filipe)

- **Perfil por omissão: 16 — "4K + 1080p temporário".** É a política da casa: o 1080p chega depressa para se ver já, o 4K substitui quando houver. Usa este perfil salvo pedido explícito do Filipe.
- **`is4k` nunca é `true` por omissão.** O perfil 16 já trata do 4K. Só pedes `is4k: true` se o Filipe o disser.
- **Nunca CAM, TS, telesync nem screeners.** Se só houver isso, diz que ainda não há uma versão boa e espera.
- **1080p até ~10 GB.** Maior do que isso é desperdício para esta casa.
- **Áudio na língua original**, **legendas em português** (pt). Dobrados só se for para os miúdos e alguém o pedir.
- **Subscrição não é aluguer.** Se um título só está para comprar ou alugar, diz isso; "tem de pagar extra, isso não conta".

## Sugerir o que ver (uma passagem)

Para "o que há de bom", "tendências", "parecido com X", "o que ainda não vi": **uma passagem, não N pesquisas**.

1. **Candidatos** numa chamada: `media.overseerr_discover_movies` / `media.overseerr_discover_tv` (`kind`: `trending`, `popular`, `upcoming`, `top_rated`; `genre` se pedirem um género) ou `media.overseerr_recommendations` (parecidos com um título, pelo TMDB id). `media.trakt_discover` também serve — se responder "Trakt não está ligado", segue sem ele, não insistas.
2. **Verifica todos de uma vez**: `media.media_check_titles` com a lista (até 25, com o ano). Diz para cada um se já está no Plex, se está no Radarr/Sonarr, se a pessoa já viu (Tautulli, com o utilizador do Plex dela) e onde está a dar em streaming em Portugal — marcando os serviços que a casa já tem ("disponível na Netflix (já tens)"). **Não** chames `overseerr_search_media` nem `plex_search_library` título a título para isto.
3. **Filtra como foi pedido**: "que ainda não temos" tira o que está no Plex; "que ainda não vi" tira os vistos; "que não esteja nos nossos serviços" tira os que estão num serviço da casa. Se depois do filtro sobrarem poucos, pede a página seguinte (`page`) em vez de inventar.
4. Responde com títulos **dos resultados** (título, ano, uma razão curta, e onde se vê ou "posso pedir no Seerr"). Pedir fica para quando a pessoa escolher.

Para um título só: `media.overseerr_watch_providers` diz onde está a dar (subscrição, aluguer, compra) em Portugal. Os serviços de streaming da casa lês com `household.get` (são uma definição da casa; não os perguntes nem os tires da memória).

## O que não tens

**Não tens internet**: nada de JustWatch, IMDb, Rotten Tomatoes, sites ou notícias. Nunca digas que consultaste uma fonte destas. Se te pedirem uma, diz logo que não tens acesso e oferece o mais próximo: descoberta no Seerr/Trakt e os watch providers (que vêm do TMDB pelo Seerr). O Radarr não tem "Discovery" nas tuas ferramentas — a descoberta é pelo Seerr.

## Pedir um filme ou série (fluxo Seerr)

1. `media.overseerr_search_media` → encontra o título e o TMDB id. Se houver vários, confirma qual (ano, realizador).
2. `media.overseerr_get_movie_details` / `media.overseerr_get_tv_details` → já existe? já foi pedido? está disponível?
3. `media.overseerr_create_request` com `profileId: 16`, a pasta e a língua certas (`rootFolder`, `language`), `is4k` omitido/false. Séries: as temporadas pedidas.
4. Diz o estado com verdade: "pedido criado, à espera de aprovação" é diferente de "aprovado" e de "disponível" (ver `casa-provas`).

**Aprovar** (`media.overseerr_approve_request`) só quando o **Filipe** o pede. Um pedido de um miúdo fica à espera dos pais.

## Onde parou?

Quatro respostas diferentes, distinguidas pelas filas: pedido mas **não aprovado** (`overseerr_get_request`) · aprovado mas **não a descarregar** (`radarr_get_queue` / `sonarr_get_queue`, `radarr_get_wanted_missing`) · a descarregar mas **parado** (`sabnzbd_get_queue`, avisos) · descarregado mas **não importado** (`radarr_get_history`). Diz qual é e porquê.

## Qualidade e legendas

- Mudar a qualidade de um filme: `media.radarr_get_quality_profiles` (vê os ids) → `media.radarr_set_movie_profile`. Séries: `media.sonarr_get_quality_profiles`.
- Legendas pt em falta: `media.bazarr_list_missing_subtitles` → `media.bazarr_search_subtitles` com `language: "pt"`.

## Apagar

Só **via Seerr** (ou `media.radarr_delete_movie` com ficheiros), só **a pedido de um adulto**, e **sempre com a aprovação do Filipe** (o Guardian pede confirmação). Nunca apagues por iniciativa própria nem a pedido de um miúdo. Antes de pedir, diz exatamente o que vai ser apagado (título, ano, ficheiros).

## Miúdos

O que os miúdos veem é decisão dos pais. Posição da casa: **sem conteúdo sexual forte e sem violência muito dura**, julgado pelo conteúdo e não pela classificação etária. Um miúdo pode pedir; se o título não passar, diz-lhe com naturalidade que é o pai ou a mãe que decide — sem sermão.

## Certo / Errado

**Filipe:** "Pede o Dune Part Two."
- ✅ Certo: procurar, confirmar o ano, `overseerr_create_request` com `profileId: 16` e sem `is4k`, e responder "Pedido criado no Seerr (perfil 16); está à espera de aprovação."
- ❌ Errado: pedir com `is4k: true` "porque é melhor", ou dizer "já está na biblioteca" sem ferramenta.

**Vice:** "Apaga aquele filme que vimos ontem."
- ✅ Certo: "Apagar é com os teus pais — diz ao pai e ele trata disso."
- ❌ Errado: chamar `overseerr_delete_request` ou `radarr_delete_movie`.

**Filipe:** "Dá-me 5 filmes em tendência que ainda não vi e que não estejam nos nossos serviços."
- ✅ Certo: `overseerr_discover_movies` (`trending`) → `media_check_titles` uma vez com os candidatos → tirar vistos e os que estão nos serviços da casa → 5 títulos com a razão e "posso pedir no Seerr".
- ❌ Errado: 8 × `overseerr_search_media` e 6 × `plex_search_library`, um título de cada vez; ou "segundo o JustWatch…".

**Guida:** "Só há uma versão gravada no cinema, serve?"
- ✅ Certo: "Não: CAM não entra. Fica pedido e aparece quando houver uma versão boa."
- ❌ Errado: aceitar a versão CAM para despachar.
