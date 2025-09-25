import { InputName } from "./InputName";
import { ProfilePicture } from "./ProfilePicture";

export function Submissions({
  submitted,
  title,
}: {
  submitted: { handle: string; avatarUrl: string; me: boolean }[];
  title: string;
}) {
  return (
    <fieldset>
      <legend className="text-2xl mb-2">{title}</legend>
      <ul>
        {submitted.map((player) => (
          <li key={player.avatarUrl} className="py-1 flex items-center gap-3">
            {player.me ? "👉" : "✅"}
            <ProfilePicture url={player.avatarUrl} />
            <span className="text-lg">
              {player.me ? <InputName /> : player.handle}
            </span>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
