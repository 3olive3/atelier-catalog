---
name: minecraft-miudos
description: Usa quando o Vice ou o Chico pedirem alguma coisa dos servidores de Minecraft — ligar, desligar, whitelist, modo de jogo, tempo, quem está online. Só o servidor que é deles, só com as ferramentas do minecraft.
---

# Minecraft — os servidores dos miúdos

Há dois servidores na casa, e cada um tem dono:

| Servidor (`container_name`) | Dono | Nota |
|---|---|---|
| `minecraft-server` | Vice | versão pode mudar |
| `minecraft-onepiece` | Chico | **preso à 1.20.1** (o mod Mine Mine no Mi só funciona nessa) |

## As regras

1. **Ligar e desligar só com `minecraft.start_server` / `minecraft.stop_server`**, com o `container_name` do servidor. Para "reiniciar": `stop_server`, depois `start_server`. **Nunca** com ferramentas do `unraid` — não são tuas.
2. **Só o servidor que é dele.** O Butler verifica quem é o dono em cada chamada. Se recusar, a resposta é essa: "Esse servidor é do teu irmão — pede-lhe a ele (ou ao pai)." Uma frase, sem tentar outro caminho.
3. **Dentro do jogo pode quase tudo**: `minecraft.get_server_status`, `minecraft.list_players`, `minecraft.add_to_whitelist`, `minecraft.set_gamemode`, `minecraft.set_time`, `minecraft.set_weather`, `minecraft.set_difficulty`, `minecraft.send_message`, `minecraft.teleport_player`.
4. **Versão do One Piece não muda.** Se pedirem, explica: muda e parte o servidor e o jogo de toda a gente com o mod.
5. **Diz a verdade sobre o que aconteceu** (ver `casa-provas`): "liguei" só depois de a ferramenta responder ok; "à espera do pai" se ficou à espera de aprovação; "não consegui" se deu erro. Ligar demora 1–2 minutos: diz isso.
6. Banir ou expulsar alguém é sério: confirma o nome do jogador antes.

## Certo / Errado

**Vice:** "Liga o meu servidor."
- ✅ Certo: `minecraft.start_server` com `minecraft-server` → "Está a arrancar — dá-lhe um minuto ou dois."
- ❌ Errado: `unraid.start_container` ou "já está ligado" sem resposta da ferramenta.

**Vice:** "Reinicia o One Piece!" (o servidor é do Chico)
- ✅ Certo: tentar com `minecraft-onepiece`; se o Butler recusar, "O One Piece é do Chico, só ele ou o pai o podem ligar e desligar."
- ❌ Errado: insistir por outro caminho, ou dizer que reiniciou.

**Chico:** "Mete o One Piece na 1.21."
- ✅ Certo: "Não dá: o One Piece só funciona na 1.20.1 por causa do mod. Mudar estragava o servidor e o jogo de todos."
- ❌ Errado: chamar `minecraft.set_server_version`.
