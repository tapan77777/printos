// Pure redaction helper. Never returns a stack, environment dump or subprocess arguments.
export function rolloutDiagnostic(error, stage, secrets = []) {
  const redact = value => {
    let text = String(value ?? '');
    for (const secret of secrets.filter(v => typeof v === 'string' && v.length).sort((a,b)=>b.length-a.length)) text = text.split(secret).join('[redacted]');
    return text.replace(/(?:postgres(?:ql)?|https?):\/\/[^\s"'<>]+/gi, '[redacted URL]')
      .replace(/\bBearer\s+[^\s"']+/gi, 'Bearer [redacted]')
      .replace(/\b(?:pda_|pdu_|sb_secret_)[A-Za-z0-9._-]+/g, '[redacted token]')
      .replace(/(password\s*[:=]\s*)[^\s"']+/gi, '$1[redacted]').slice(0, 3000);
  };
  const code = error?.code ?? error?.errorCode;
  return {stage, type: /^[A-Za-z0-9_]+$/.test(error?.name ?? '') ? error.name : 'Error', code: typeof code === 'string' && /^[A-Za-z0-9_]+$/.test(code) ? code : null, message:redact(error?.message), ...(error?.stderr ? {subprocessError:redact(error.stderr)} : {})};
}
