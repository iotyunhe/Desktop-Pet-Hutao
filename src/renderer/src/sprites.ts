import idleSpriteUrl from '../assets/pet/hutao-chibi.png';
import curiousSpriteUrl from '../assets/pet/hutao-curious.png';
import deskReadSpriteUrl from '../assets/pet/hutao-desk-read.png';
import deskTeaSpriteUrl from '../assets/pet/hutao-desk-tea.png';
import deskWriteSpriteUrl from '../assets/pet/hutao-desk-write.png';
import happySpriteUrl from '../assets/pet/hutao-happy.png';
import eatSpriteUrl from '../assets/pet/hutao-eat.png';
import giftSpriteUrl from '../assets/pet/hutao-gift.png';
import patSpriteUrl from '../assets/pet/hutao-pat.png';
import proudSpriteUrl from '../assets/pet/hutao-proud.png';
import sleepySpriteUrl from '../assets/pet/hutao-sleepy.png';
import walkLeftSpriteUrl from '../assets/pet/hutao-walk-left.png';
import walkRightSpriteUrl from '../assets/pet/hutao-walk-right.png';
import umbrellaWalkLeftSpriteUrl from '../assets/pet/hutao-umbrella-walk-left.png';
import umbrellaWalkRightSpriteUrl from '../assets/pet/hutao-umbrella-walk-right.png';
import lanternWishSpriteUrl from '../assets/pet/hutao-lantern-wish.png';
import talismanSpriteUrl from '../assets/pet/hutao-talisman.png';
import napSpriteUrl from '../assets/pet/hutao-nap.png';
import flusteredSpriteUrl from '../assets/pet/hutao-flustered.png';
import offerTeaSpriteUrl from '../assets/pet/hutao-offer-tea.png';
import booSpriteUrl from '../assets/pet/hutao-boo.png';
import booGrinSpriteUrl from '../assets/pet/hutao-boo-grin.png';
import twirlSpriteUrl from '../assets/pet/hutao-twirl.png';
import abacusSpriteUrl from '../assets/pet/hutao-abacus.png';
import stretchSpriteUrl from '../assets/pet/hutao-stretch.png';
import type { PetMood } from './state';

export const sprites: Record<PetMood, string> = {
  idle: idleSpriteUrl,
  happy: happySpriteUrl,
  curious: curiousSpriteUrl,
  sleepy: sleepySpriteUrl,
  pat: patSpriteUrl,
  eat: eatSpriteUrl,
  gift: giftSpriteUrl,
  proud: proudSpriteUrl,
  'desk-read': deskReadSpriteUrl,
  'desk-tea': deskTeaSpriteUrl,
  'desk-write': deskWriteSpriteUrl,
  'walking-left': walkLeftSpriteUrl,
  'walking-right': walkRightSpriteUrl,
  'umbrella-walk-left': umbrellaWalkLeftSpriteUrl,
  'umbrella-walk-right': umbrellaWalkRightSpriteUrl,
  'lantern-wish': lanternWishSpriteUrl,
  talisman: talismanSpriteUrl,
  nap: napSpriteUrl,
  'flustered-pat': flusteredSpriteUrl,
  'offer-tea': offerTeaSpriteUrl,
  boo: booSpriteUrl,
  'boo-grin': booGrinSpriteUrl,
  twirl: twirlSpriteUrl,
  abacus: abacusSpriteUrl,
  stretch: stretchSpriteUrl
};
