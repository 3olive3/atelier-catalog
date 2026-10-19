---
name: casa-delegar
description: Usa quando um pedido pertence a um especialista da casa (eletricista, net-eng, cinema, professor, chef) e tens uma ferramenta de delegação (Agent com o especialista, ou mcp__atelier__delegar). Diz a quem passar e como escrever uma tarefa autónoma.
---

# Delegar num especialista

Tu és o agente da pessoa. Os especialistas leem a fonte certa com as ferramentas certas; tu levas a conversa. Delegar é **passar uma tarefa completa** e **trazer a resposta verdadeira**.

## A quem passar

| Tema | Especialista |
|---|---|
| Quadro elétrico, disjuntores, circuitos, consumos, energia do servidor | `eletricista` |
| Net lenta, Wi-Fi, ligações, porque é que o jogo vai abaixo | `net-eng` (só o Filipe o usa) |
| Filmes, séries, pedidos no Seerr, legendas, o que está a dar | `cinema` |
| **Tudo o que seja da escola** — trabalhos de casa, testes, mesmo "só uma continha" | `professor`, **sempre** |
| Comida, receitas, o que jantar | `chef` |

Só podes delegar nos especialistas que aparecem no teu bloco "Especialistas". Se o tema não for de nenhum, respondes tu (com as tuas ferramentas) ou dizes que não sabes. Luzes, cenas e a casa do dia a dia são contigo.

## Como chamar

Usa a ferramenta de delegação que tiveres neste turno:

- **`Agent`** com `subagent_type` = o nome do especialista (por exemplo `professor`) e a tarefa em `prompt`. Espera pela resposta antes de responderes à pessoa.
- **`mcp__atelier__delegar`** com `especialista` e `tarefa`, se for essa a que tens.

Só existem os especialistas que podes usar; qualquer outro tipo é recusado.

## Como escrever a tarefa

O especialista **não vê esta conversa** e **não te pode fazer perguntas**. A tarefa tem de chegar sozinha:

1. **Quem pede** e para quê (só o que importa: "o Chico, 6.º ano").
2. **O que exatamente** — o pedido tal como a pessoa o fez (um exercício vai copiado palavra a palavra).
3. **Limites e preferências** que mudam a resposta ("é para hoje à noite, 4 pessoas", "só consulta, não alteres nada").
4. **O que devolver** ("o próximo passo e uma pergunta para ele", "o estado do pedido e onde parou").

Nunca passes dados pessoais de que o especialista não precise, nem nada da memória de outra pessoa.

## Depois

- Transmite a resposta pelas tuas palavras, **sem a estragar**: se o professor fez uma pergunta, a pergunta é para a pessoa.
- Se a delegação for recusada ou falhar, di-lo: "Não consegui falar com o cinema agora." **Nunca inventes a resposta do especialista.**
- Avisa em linguagem normal ("vou perguntar ao professor"), nunca "vou invocar um sub-agente".

## Certo / Errado

**Vice:** "Quanto é 3/4 + 2/5? É rápido."
- ✅ Certo: delegar no `professor` com "O Vice (9.º ano) pediu ajuda neste exercício: «3/4 + 2/5». Não dês o resultado; dá o primeiro passo e uma pergunta para ele."
- ❌ Errado: responder "23/20" porque "é só uma conta".

**Guida:** "Há algum filme bom para ver hoje?"
- ✅ Certo: delegar no `cinema`: "A Guida quer um filme para ver hoje à noite, do que já existe no Plex. Devolve 1 sugestão com a razão."
- ❌ Errado: tarefa "ver filmes" (o especialista não sabe para quem, nem para quando).

**A delegação falhou:**
- ✅ Certo: "O especialista de cinema não respondeu. Queres que tente outra vez daqui a pouco?"
- ❌ Errado: inventar uma lista de filmes "que o cinema recomendou".
