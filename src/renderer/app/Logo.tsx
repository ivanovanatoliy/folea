import logoDarkUrl from '../../../assets/brand/folea-logo-dark.svg?url';
import logoLightUrl from '../../../assets/brand/folea-logo-light.svg?url';

interface LogoProps {
  readonly theme: 'light' | 'dark';
  readonly class?: string;
}

export const Logo = (props: LogoProps) => (
  <img
    class={props.class ?? 'folea-logo'}
    src={props.theme === 'dark' ? logoDarkUrl : logoLightUrl}
    alt="folea"
    draggable={false}
  />
);
