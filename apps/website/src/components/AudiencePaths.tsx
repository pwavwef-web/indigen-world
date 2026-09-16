import { Button } from "./Button";
import { STUDIO_CREATE_URL } from "../content/creatorLinks";

export function AudiencePaths() {
  return <div className="journey-grid journey-grid--audiences">
    <article className="journey-card"><h3>For learners & families</h3><p>Find a word, hear its pronunciation when available, and save it for another visit.</p><Button to="dictionary" variant="secondary">Find your first word</Button></article>
    <article className="journey-card"><h3>For creators & speakers</h3><p>Share writing, a recording, a video or a translation. Start with a draft in TribeStudio.</p><Button href={STUDIO_CREATE_URL} external variant="secondary">Create a first post</Button></article>
    <article className="journey-card"><h3>For educators & researchers</h3><p>Talk with us about classroom use, language review or a research collaboration.</p><Button to="get-involved?route=school" variant="secondary">Discuss classroom use</Button><Button to="get-involved?route=researcher" variant="secondary">Discuss research</Button></article>
    <article className="journey-card"><h3>For partners & supporters</h3><p>Help with resources, cultural partnerships or funding for the work ahead.</p><Button to="get-involved?route=sponsor" variant="secondary">Discuss a partnership</Button></article>
  </div>;
}
