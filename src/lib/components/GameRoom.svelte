<script lang="ts">
  import type { GameClient } from '$lib/client.svelte';
  import type { PassportProfile } from '$lib/profile.svelte';
  import type { ClientState, Phase } from '$lib/shared/types';
  import PassportSpread from './PassportSpread.svelte';
  import PassportIdentity from './PassportIdentity.svelte';
  import PassportStamp from './PassportStamp.svelte';
  import PrivateDestination from './PrivateDestination.svelte';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';
  import Timer from './Timer.svelte';
  import PlayerCard from './PlayerCard.svelte';
  import Role from './Role.svelte';
  import Discussion from './Discussion.svelte';
  import Voting from './Voting.svelte';
  import FinalGuess from './FinalGuess.svelte';
  import Results from './Results.svelte';
  let { game, room, profile }: { game: GameClient; room: ClientState; profile: PassportProfile } =
    $props();
  let copied = $state(false);
  const connectedCount = $derived(room.players.filter((p) => p.connected).length);
  const phaseNames: Record<Phase, string> = {
    LOBBY: 'Boarding lounge',
    ROLE_REVEAL: 'Secret role',
    DISCUSSION: 'Discussion',
    VOTING: 'Customs check',
    FINAL_GUESS: 'Final chance',
    RESULTS: 'Entry decision',
  };
  async function copy() {
    try {
      await navigator.clipboard.writeText(room.roomCode);
      copied = true;
    } catch {
      game.error = 'Could not copy automatically. Share the six-character room code below.';
    }
  }
</script>

<PassportSpread
  phaseKey="{room.roundNumber}-{room.phase}"
  leftLabel="Your player passport"
  rightLabel={phaseNames[room.phase]}
>
  {#snippet left()}
    <div class="room-identity-page">
      <PassportIdentity {profile} {room} />
      <div class="room-ticket">
        <div>
          <span class="passport-field-label">BOARDING CODE</span><strong data-testid="room-code"
            >{room.roomCode}</strong
          >
        </div>
        <button
          class="icon-button"
          onclick={copy}
          aria-label={copied ? 'Room code copied' : 'Copy room code'}
          ><Icon name={copied ? 'check' : 'copy'} size={23} /></button
        >
      </div>
      {#if room.phase === 'DISCUSSION'}{#key room.roundNumber}<PrivateDestination
            {room}
          />{/key}{:else}<div class="identity-travel-stamps">
          <PassportStamp
            text={room.phase === 'LOBBY' ? 'CLEARED\nFOR FUN' : 'ON A\nSECRET MISSION'}
            variant={room.phase === 'LOBBY' ? 'green' : 'blue'}
            size="large"
            rotation={-6}
          />
          <p>Trust your instincts.<br />Question your friends.</p>
        </div>{/if}
      <div class="identity-departure">
        <p><Icon name="people" size={20} /> Play together in person or on a voice call.</p>
        <Button
          variant="quiet"
          onclick={() => game.leave()}
          disabled={game.pending || !game.connected}>Leave room</Button
        >
      </div>
    </div>
  {/snippet}
  {#snippet right()}
    <div class="phase-bar">
      <span class="phase-label"
        ><span class="guest-dot"></span>{room.phase === 'LOBBY'
          ? 'NOW BOARDING'
          : `ROUND ${String(room.roundNumber).padStart(2, '0')} · ${phaseNames[room.phase].toUpperCase()}`}</span
      ><Timer deadline={room.deadline} clockOffset={game.clockOffset} />
    </div>
    <div class="game-activity">
      {#if room.testMode}<div class="test-mode-banner" role="status">
          TEST MODE - 2 PLAYER DEV TEST
        </div>{/if}
      {#key `${room.roundNumber}-${room.phase}`}
        {#if room.phase === 'LOBBY'}
          <div class="phase-heading">
            <h1>ALL ABOARD!</h1>
            <p>Share your room code. Round up your usual suspects.</p>
          </div>
          <div class="boarding-status">
            <span>{connectedCount} / 10 PLAYERS</span>
            <p>
              {connectedCount < room.minPlayers
                ? `${room.minPlayers - connectedCount} more ${room.minPlayers - connectedCount === 1 ? 'friend' : 'friends'} to take off!`
                : 'Your crew is ready for departure.'}
            </p>
          </div>
        {:else if room.phase === 'ROLE_REVEAL'}<Role {game} {room} />
        {:else if room.phase === 'DISCUSSION'}<Discussion {game} {room} />
        {:else if room.phase === 'VOTING'}<Voting {game} {room} />
        {:else if room.phase === 'FINAL_GUESS'}<FinalGuess {game} {room} />
        {:else}<Results {game} {room} />{/if}
      {/key}
    </div>
    {#if room.phase !== 'VOTING' && room.phase !== 'RESULTS'}
      <section class="crew-panel" aria-label="Your crew">
        <div class="crew-heading">
          <h2>PASSENGER MANIFEST</h2>
          <span>{connectedCount} / 10</span>
        </div>
        <div class="roster">
          {#each room.players as player, index}<PlayerCard
              {player}
              youId={room.youId}
              hostId={room.hostPlayerId}
              {index}
              status={room.phase === 'ROLE_REVEAL' && player.ready ? 'Ready' : undefined}
            />{/each}
        </div>
      </section>
    {/if}
    {#if room.phase === 'LOBBY'}<div class="phase-actions">
        {#if room.testModeAvailable}<div class="test-mode-control" class:enabled={room.testMode}>
            <div>
              <span class="passport-field-label">TEST MODE</span>
              <strong>2 PLAYER DEV TEST</strong>
              <p>Development only. Normal games still require 4 players.</p>
            </div>
            {#if room.hostPlayerId === room.youId}<button
                type="button"
                role="switch"
                aria-label="Enable 2 player test mode"
                aria-checked={room.testMode}
                onclick={() => game.setTestMode(!room.testMode)}
                disabled={game.pending || !game.connected}
                >{room.testMode ? 'ON' : 'OFF'}<span aria-hidden="true"></span></button
              >{/if}
          </div>{/if}
        {#if room.hostPlayerId === room.youId}<Button
            onclick={() => game.action('game:start')}
            disabled={connectedCount < room.minPlayers || game.pending || !game.connected}
            class="full-width">Start game <Icon name="arrow" size={24} /></Button
          >
          <p class="field-hint">
            {connectedCount < room.minPlayers
              ? `At least ${room.minPlayers} connected players needed. Maximum mischief: 10.`
              : 'Everyone here? Let the bluffing begin!'}
          </p>{:else}<p class="waiting-note">Waiting for the host to start the game.</p>{/if}
      </div>{/if}
  {/snippet}
</PassportSpread>
