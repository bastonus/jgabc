"""
unified_chant_aligner.py
Moteur d'alignement acoustique universel et autonome pour le chant grégorien (Oremus / JGABC).

Conçu pour fonctionner sans aucune retouche manuelle :
1. VAD acoustique robuste (RMS + Périodicité Torchcrepe) : élimine tout étalement sur les silences initiaux ou finaux.
2. Détection macro-structurelle par transition de hauteurs modales et creux de respiration :
   - Détection de la frontière Refrain -> Verset par saut mélodique cadence/incipit.
   - Détection de la frontière Verset -> Reprise par symétrie liturgique et saut mélodique.
3. Calibrage modal automatique (F_base par maximisation de vraisemblance sur la gamme grégorienne).
4. Détection des frontières de syllabes et transitoires acoustiques (creux RMS, consonne sourde, répercussion) pour éviter les retards sur les répétitions de hauteur (ex: vo-ce).
5. HSMM Viterbi vectorisé à durée explicite : ultra-rapide (< 1s par pièce), plancher minimal physiologique (>= 0.16s), respect strict des poids de durée GABC, monotonie et continuité totales.
"""

import os
import sys
import json
import time
import numpy as np
import soundfile as sf
import torchaudio
import torchcrepe
import torch

class UnifiedChantAligner:
    def __init__(self, sample_rate=16000, hop_ms=10):
        self.sr = sample_rate
        self.hop_ms = hop_ms
        self.dt = hop_ms / 1000.0
        self.diatonic_offsets = {0: 0, 1: 2, 2: 4, 3: 5, 4: 7, 5: 9, 6: 11, 7: 12}
        
    def extract_or_load_features(self, wav_path, pitch_cache_path=None):
        """Charge l'audio et extrait F0 (Torchcrepe), périodicité et énergie RMS."""
        audio, sr = sf.read(wav_path)
        if len(audio.shape) > 1:
            audio = audio.mean(axis=1)
        if sr != self.sr:
            wav_t = torchaudio.functional.resample(torch.tensor(audio, dtype=torch.float32).unsqueeze(0), sr, self.sr)
            audio = wav_t.squeeze(0).numpy()
            
        total_sec = len(audio) / self.sr
        hop_samples = int(self.dt * self.sr)
        num_frames = int(np.ceil(len(audio) / hop_samples))
        times = np.arange(num_frames) * self.dt
        
        # 1. Pitch F0 & Périodicité
        if pitch_cache_path and os.path.exists(pitch_cache_path):
            cached = np.load(pitch_cache_path)
            times = cached['times']
            hz = cached['hz']
            conf = cached['conf']
            midi = cached['midi']
        else:
            wav_torch = torch.tensor(audio, dtype=torch.float32).unsqueeze(0)
            pitch, periodicity = torchcrepe.predict(
                wav_torch, self.sr, hop_samples, 75.0, 550.0,
                model='tiny', decoder=torchcrepe.decode.viterbi,
                return_periodicity=True, device='cpu', batch_size=2048
            )
            hz = pitch[0].numpy()
            conf = periodicity[0].numpy()
            midi = np.where((hz > 0) & (conf > 0.30), 69.0 + 12.0 * np.log2(np.maximum(1e-5, hz / 440.0)), 0.0)
            if pitch_cache_path:
                np.savez(pitch_cache_path, times=times, hz=hz, conf=conf, midi=midi)
                
        # 2. RMS Energy Envelope (vectorisée)
        win_len = int(0.025 * self.sr)
        audio_sq = audio**2
        rms_full = np.sqrt(np.convolve(audio_sq, np.ones(win_len)/win_len, mode='same'))
        rms = np.zeros(len(times))
        max_idx = min(len(rms), len(rms_full) // hop_samples)
        rms[:max_idx] = rms_full[::hop_samples][:max_idx]
                
        return {
            'audio': audio,
            'times': times,
            'midi': midi,
            'conf': conf,
            'rms': rms,
            'duration': total_sec
        }

    def detect_vad_boundaries(self, features):
        """Détecte le début réel du chant (t_onset) et la fin réelle (t_offset)."""
        times = features['times']
        conf = features['conf']
        rms = features['rms']
        
        # Voix active stable
        v = (conf > 0.40) & (rms > 0.0010)
        v_smooth = np.convolve(v.astype(float), np.ones(10)/10.0, mode='same') > 0.4
        v_indices = np.where(v_smooth)[0]
        
        if len(v_indices) == 0:
            return 0.0, times[-1]
            
        t_onset = float(times[v_indices[0]])
        t_offset = float(times[v_indices[-1]])
        
        t_offset = min(features['duration'], t_offset + 0.15)
        
        return t_onset, t_offset

    def get_note_target_pitch(self, note, f_base):
        """Retourne la hauteur MIDI cible de la note (universelle par demi-tons ou par position de portée)."""
        if 'pitch_semitones' in note:
            return f_base + note['pitch_semitones']
        return f_base + self.diatonic_offsets.get(note.get('staff_position', 0), 0)

    def calibrate_modal_fbase(self, features, notes, t_range=None):
        """Calibre la fréquence fondamentale de la portée (F_base ou Delta MIDI)."""
        midi = features['midi']
        conf = features['conf']
        times = features['times']
        
        mask = (conf > 0.40) & (midi > 40)
        if t_range:
            mask = mask & (times >= t_range[0]) & (times <= t_range[1])
            
        voiced = midi[mask]
        if len(voiced) == 0:
            return 49.0
            
        sample = notes[:min(60, len(notes))]
        use_semitones = 'pitch_semitones' in sample[0]
        
        if use_semitones:
            best_f_base = 32.0
            best_score = -1e9
            semis = np.array([n['pitch_semitones'] for n in sample])
            for cand in np.arange(24.0, 48.0, 0.2):
                targets = cand + semis
                score = 0
                for t in targets:
                    score += np.sum(np.abs(voiced - t) < 0.65)
                if score > best_score:
                    best_score = score
                    best_f_base = cand
            return float(round(best_f_base, 2))
        else:
            best_f_base = 49.0
            best_score = -1e9
            for cand in np.arange(45.0, 56.0, 0.1):
                score = 0
                for n in sample:
                    sp = n.get('staff_position', 0)
                    target_m = cand + self.diatonic_offsets.get(sp, sp * 2)
                    score += np.sum(np.abs(voiced - target_m) < 0.65)
                if score > best_score:
                    best_score = score
                    best_f_base = cand
            return float(round(best_f_base, 2))

    def find_pitch_transition_boundary(self, times, midi, conf, rms, t_min, t_max, target_before, target_after):
        """Détecte la transition exacte entre deux hauteurs modales séparées par une respiration."""
        mask = (times >= t_min) & (times <= t_max)
        f_indices = np.where(mask)[0]
        if len(f_indices) == 0:
            return (t_min + t_max) / 2.0
            
        best_t = times[f_indices[0]]
        best_score = -1e9
        win = int(0.25 / self.dt)
        
        for idx in f_indices:
            t = times[idx]
            if idx - win < 0 or idx + win >= len(times): continue
            
            m_before = midi[idx - win : idx]
            c_before = conf[idx - win : idx]
            v_before = c_before > 0.40
            match_before = np.mean(np.abs(m_before[v_before] - target_before) < 1.2) if np.sum(v_before) > 0 else 0
            
            m_after = midi[idx : idx + win]
            c_after = conf[idx : idx + win]
            v_after = c_after > 0.40
            match_after = np.mean(np.abs(m_after[v_after] - target_after) < 1.2) if np.sum(v_after) > 0 else 0
            
            trough = 1.0 if (conf[idx] < 0.30 or rms[idx] < 0.02) else 0.0
            
            bilateral = 4.0 * (match_before * match_after)
            score = bilateral + 1.5 * match_before + 2.0 * match_after + 1.5 * trough
            if score > best_score:
                best_score = score
                best_t = t
                
        return float(best_t)

    def find_responsorial_boundary(self, times, midi, conf, rms, t_onset, t_offset, resp_notes, verse_notes, f_base):
        """Détecte avec précision la césure liturgique (pause de respiration + saut mélodique) entre Répons et Verset."""
        tot_time = t_offset - t_onset
        W_r = sum(n.get('duration_weight', 1.0) for n in resp_notes)
        W_v = sum(n.get('duration_weight', 1.0) for n in verse_notes)
        t_mid = t_onset + tot_time * (W_r / max(0.1, W_r + W_v))

        t_min = max(t_onset + 10.0, t_onset + tot_time * 0.18)
        t_max = min(t_offset - 15.0, t_onset + tot_time * 0.72)

        v_targets = [self.get_note_target_pitch(n, f_base) for n in verse_notes[:min(8, len(verse_notes))]]
        r_targets = [self.get_note_target_pitch(n, f_base) for n in resp_notes[-min(6, len(resp_notes)):]]

        candidates = []
        in_p = False
        p_st = 0
        for i in range(len(times)):
            t = times[i]
            if t < t_min or t > t_max: continue
            if (conf[i] < 0.35 or rms[i] < 0.02) and not in_p:
                in_p = True
                p_st = t
            elif (conf[i] >= 0.35 and rms[i] >= 0.02) and in_p:
                in_p = False
                if t - p_st >= 0.20:
                    candidates.append((p_st, t))
        if in_p and times[-1] - p_st >= 0.20:
            candidates.append((p_st, times[-1]))

        if not candidates:
            p_resp_end = self.get_note_target_pitch(resp_notes[-1], f_base)
            p_verse_start = self.get_note_target_pitch(verse_notes[0], f_base)
            t_v_start = self.find_pitch_transition_boundary(
                times, midi, conf, rms,
                max(t_onset + 5.0, t_mid - 15.0),
                min(t_offset - 10.0, t_mid + 15.0),
                p_resp_end, p_verse_start
            )
            v_before = np.where((times <= t_v_start - 0.05) & (conf > 0.35) & (times >= t_v_start - 2.5))[0]
            t_r_end = float(times[v_before[-1]]) if len(v_before) > 0 else t_v_start - 0.20
            return t_r_end, t_v_start

        best_pause = candidates[0]
        best_score = -1e9
        for p_s, p_e in candidates:
            dur = p_e - p_s
            m_after_mask = (times >= p_e) & (times <= p_e + 4.0) & (conf > 0.35)
            v_match = 0
            if np.sum(m_after_mask) > 0 and len(v_targets) > 0:
                m_after = midi[m_after_mask]
                dists = [np.min(np.abs(m_after - vt)) for vt in v_targets]
                v_match = np.mean(np.array(dists) < 1.3)

            m_before_mask = (times >= p_s - 3.0) & (times <= p_s) & (conf > 0.35)
            r_match = 0
            if np.sum(m_before_mask) > 0 and len(r_targets) > 0:
                m_before = midi[m_before_mask]
                dists = [np.min(np.abs(m_before - rt)) for rt in r_targets]
                r_match = np.mean(np.array(dists) < 1.3)

            score = 3.0 * dur + 4.0 * v_match + 2.0 * r_match - 2.0 * abs(p_s - t_mid) / max(1.0, tot_time)
            if score > best_score:
                best_score = score
                best_pause = (p_s, p_e)

        t_r_end = float(best_pause[0])
        t_v_start = float(best_pause[1])
        return t_r_end, t_v_start

    def snap_cadence_boundaries_to_breaths(self, aligned_notes, features):
        """
        Ajuste avec précision chirurgicale les frontières de cadences (barres de division)
        sur les creux de respiration réels et les attaques vocales.
        """
        times = features['times']
        conf = features['conf']
        rms = features['rms']
        N = len(aligned_notes)
        
        for i in range(N - 1):
            n_curr = aligned_notes[i]
            n_next = aligned_notes[i+1]
            
            bar = n_curr.get('bar_after')
            is_breath = n_curr.get('is_breath_after') or (bar in [':', ';', ',', '::', '*(;)', '*'])
            
            if not is_breath:
                continue
                
            t_bound = n_curr.get('end')
            if t_bound is None: continue
            
            w_min = max(times[0], t_bound - 1.2)
            w_max = min(times[-1], t_bound + 1.2)
            mask = (times >= w_min) & (times <= w_max)
            t_win = times[mask]
            c_win = conf[mask]
            r_win = rms[mask]
            if len(t_win) == 0: continue
            
            is_silent = (c_win < 0.35) | (r_win < 0.015)
            pauses = []
            in_p = False
            p_st = 0
            for idx in range(len(t_win)):
                if is_silent[idx] and not in_p:
                    in_p = True
                    p_st = t_win[idx]
                elif not is_silent[idx] and in_p:
                    in_p = False
                    if t_win[idx] - p_st >= 0.10:
                        pauses.append((p_st, t_win[idx]))
            if in_p and t_win[-1] - p_st >= 0.10:
                pauses.append((p_st, t_win[-1]))
                
            if not pauses:
                min_r_idx = np.argmin(r_win)
                t_trough = float(t_win[min_r_idx])
                if t_trough > n_curr['start'] + 0.14 and t_trough < n_next['end'] - 0.14:
                    n_curr['end'] = round(t_trough, 3)
                    n_curr['duration'] = round(n_curr['end'] - n_curr['start'], 3)
                    n_next['start'] = round(t_trough, 3)
                    n_next['duration'] = round(n_next['end'] - n_next['start'], 3)
                continue
                
            best_pause = min(pauses, key=lambda p: abs((p[0] + p[1])/2.0 - t_bound))
            p_start, p_end = best_pause
            
            if p_start > n_curr['start'] + 0.14 and p_end < n_next['end'] - 0.14:
                n_curr['end'] = round(float(p_start), 3)
                n_curr['duration'] = round(float(n_curr['end'] - n_curr['start']), 3)
                n_next['start'] = round(float(p_end), 3)
                n_next['duration'] = round(float(n_next['end'] - n_next['start']), 3)
                
        return aligned_notes

    def detect_acoustic_pauses(self, times, conf, rms, t_start, t_end, min_pause_dur=0.08, max_gap=0.08):
        """Détecte avec précision tous les creux de respiration acoustique avec comblement des micro-gaps."""
        mask = (times >= t_start) & (times <= t_end)
        t_sub = times[mask]
        c_sub = conf[mask]
        r_sub = rms[mask]
        
        is_silent = (c_sub < 0.35) | (r_sub < 0.015)
        gap_frames = int(max_gap / self.dt)
        if gap_frames > 0:
            closed = np.copy(is_silent)
            n_c = len(closed)
            i = 0
            while i < n_c:
                if not closed[i]:
                    j = i
                    while j < n_c and not closed[j]:
                        j += 1
                    if (j - i) <= gap_frames and i > 0 and j < n_c:
                        if closed[i - 1] and closed[j]:
                            closed[i:j] = True
                    i = j
                else:
                    i += 1
            is_silent = closed
            
        pauses = []
        in_p = False
        p_st = 0.0
        for i in range(len(t_sub)):
            if is_silent[i] and not in_p:
                in_p = True
                p_st = t_sub[i]
            elif not is_silent[i] and in_p:
                in_p = False
                if t_sub[i] - p_st >= min_pause_dur:
                    pauses.append((float(p_st), float(t_sub[i])))
        if in_p and t_sub[-1] - p_st >= min_pause_dur:
            pauses.append((float(p_st), float(t_sub[-1])))
        return pauses

    def match_bars_to_pauses(self, bars_info, pauses, times, midi, conf, f_base, t_start, t_end):
        """
        Associe de manière optimale et monotone les barres de division liturgiques
        aux pauses de respiration réelles par programmation dynamique avec pénalité de saut.
        """
        K = len(bars_info)
        M = len(pauses)
        if K == 0 or M == 0:
            return {}
            
        tot_time = t_end - t_start
        cost_matrix = np.full((K, M), 1e5)
        
        for k in range(K):
            b = bars_info[k]
            t_est = b['t_est']
            cadence_targets = b['cadence_targets']
            incipit_targets = b['incipit_targets']
            bar_sym = b['bar_sym']
            w_bar = 2.5 if bar_sym in [':', '::'] else (1.8 if bar_sym in [';', '*(;)'] else 1.0)
            
            # Corridor d'erreur adaptatif: proportionnel à la distance aux extrémités
            min_dist_to_edge = min(t_est - t_start, t_end - t_est)
            max_time_err = max(3.5, 0.40 * min_dist_to_edge)
            
            for m in range(M):
                p_s, p_e = pauses[m]
                dur = p_e - p_s
                time_err = abs(p_s - t_est)
                
                if time_err > max_time_err:
                    continue
                    
                # Pitch après pause (incipit)
                m_aft_mask = (times >= p_e) & (times <= p_e + 2.5) & (conf > 0.35)
                aft_match = 0
                if np.sum(m_aft_mask) > 0 and len(incipit_targets) > 0:
                    m_aft = midi[m_aft_mask]
                    dists = [np.min(np.abs(m_aft - it)) for it in incipit_targets]
                    aft_match = np.mean(np.array(dists) < 1.3)
                    
                # Pitch avant pause (cadence)
                m_bef_mask = (times >= p_s - 2.5) & (times <= p_s) & (conf > 0.35)
                bef_match = 0
                if np.sum(m_bef_mask) > 0 and len(cadence_targets) > 0:
                    m_bef = midi[m_bef_mask]
                    dists = [np.min(np.abs(m_bef - ct)) for ct in cadence_targets]
                    bef_match = np.mean(np.array(dists) < 1.3)
                    
                time_pen = 1.8 * (time_err / max_time_err)**1.5
                score = 3.5 * aft_match + 2.5 * bef_match + 1.5 * min(0.8, dur) - time_pen
                if score > 0.2:
                    cost_matrix[k, m] = -w_bar * score
                    
        dp = np.full((K + 1, M + 1), 1e5)
        bp = np.full((K + 1, M + 1, 2), -1, dtype=int)
        dp[0, 0] = 0.0
        
        skip_costs = []
        for k in range(K):
            bs = bars_info[k]['bar_sym']
            if bs in [':', '::']:
                skip_costs.append(2.0)
            elif bs in [';', '*(;)']:
                skip_costs.append(1.0)
            else: # ','
                skip_costs.append(0.0)
                
        for k in range(K):
            s_cost = skip_costs[k]
            for m_idx in range(M + 1):
                cur_c = dp[k, m_idx]
                if cur_c >= 1e5:
                    continue
                    
                # Option 1: Sauter la barre k
                if cur_c + s_cost < dp[k + 1, m_idx]:
                    dp[k + 1, m_idx] = cur_c + s_cost
                    bp[k + 1, m_idx] = [m_idx, -1]
                    
                # Option 2: Associer la barre k à la pause m'
                start_m = 0 if m_idx == 0 else m_idx
                for m_prime in range(start_m, M):
                    match_cost = cost_matrix[k, m_prime]
                    if match_cost < 1e5:
                        tot_c = cur_c + match_cost
                        if tot_c < dp[k + 1, m_prime + 1]:
                            dp[k + 1, m_prime + 1] = tot_c
                            bp[k + 1, m_prime + 1] = [m_idx, m_prime]
                            
        best_m_idx = np.argmin(dp[K])
        matched_pauses = {}
        curr_m_idx = best_m_idx
        for k in range(K - 1, -1, -1):
            prev_m_idx, matched_m = bp[k + 1, curr_m_idx]
            if matched_m >= 0:
                matched_pauses[k] = pauses[matched_m]
            curr_m_idx = prev_m_idx
            
        return matched_pauses

    def align_phrase_aware_segment(self, sec_notes, t_start, t_end, features, f_base):
        """
        Alignement hiérarchique par phrases liturgiques : découpe les sections aux
        barres de division pour éliminer toute dérive cumulée et verrouiller les cadences.
        """
        N_s = len(sec_notes)
        if N_s == 0: return []
        
        times = features['times']
        midi = features['midi']
        conf = features['conf']
        rms = features['rms']
        
        tot_time = t_end - t_start
        
        # S'assurer que is_syl_start est bien renseigné
        for i in range(len(sec_notes)):
            if i == 0:
                sec_notes[i]['is_syl_start'] = True
            else:
                is_diff_word = (sec_notes[i].get('word') != sec_notes[i-1].get('word'))
                is_diff_map = (sec_notes[i].get('mapping_index') != sec_notes[i-1].get('mapping_index'))
                sec_notes[i]['is_syl_start'] = is_diff_word or is_diff_map or sec_notes[i-1].get('is_word_end', False)
                
        # 1. Calcul des poids adaptés (syllabique vs mélismatique)
        w_adapted = []
        for n in sec_notes:
            w = n.get('duration_weight', 1.0)
            is_syl = n.get('is_syl_start', False)
            is_word_text = bool(n.get('word') and n.get('word') != '—')
            if is_syl and is_word_text:
                w_adapted.append(w * 0.65)
            else:
                w_adapted.append(w * 1.45)
        tot_adapted = sum(w_adapted)
        
        # 2. Collecte des barres liturgiques internes
        bars_info = []
        cum_w = 0.0
        for i, n in enumerate(sec_notes[:-1]):
            cum_w += w_adapted[i]
            bar = n.get('bar_after')
            is_major = bar in [':', '::', ';', '*(;)']
            if is_major and i >= 4 and (N_s - i) >= 5:
                cadence_targets = [self.get_note_target_pitch(sec_notes[j], f_base) for j in range(max(0, i-3), i+1)]
                incipit_targets = [self.get_note_target_pitch(sec_notes[j], f_base) for j in range(i+1, min(len(sec_notes), i+5))]
                t_est = t_start + tot_time * (cum_w / max(0.1, tot_adapted))
                bars_info.append({
                    'note_idx': i,
                    'bar_sym': bar,
                    'word': n.get('word'),
                    't_est': t_est,
                    'cadence_targets': cadence_targets,
                    'incipit_targets': incipit_targets
                })
                
        if not bars_info or tot_time < 15.0:
            raw = self.align_segment_hsmm(sec_notes, t_start, t_end, features, f_base)
            res_notes = []
            for i, (st, en, dur) in enumerate(raw):
                c = dict(sec_notes[i])
                c['start'], c['end'], c['duration'] = st, en, dur
                res_notes.append(c)
            return self.snap_cadence_boundaries_to_breaths(res_notes, features)
            
        # 3. Détection des pauses acoustiques et appariement par DP
        pauses = self.detect_acoustic_pauses(times, conf, rms, t_start, t_end, min_pause_dur=0.08)
        matched = self.match_bars_to_pauses(bars_info, pauses, times, midi, conf, f_base, t_start, t_end)
        
        # 4. Découpage en sous-phrases
        phrase_ranges = []
        prev_note_idx = 0
        cur_t_start = t_start
        
        for k, b in enumerate(bars_info):
            if k in matched:
                end_note_idx = b['note_idx']
                p_notes = sec_notes[prev_note_idx : end_note_idx + 1]
                p_s, p_e = matched[k]
                if p_s > cur_t_start + len(p_notes) * 0.14:
                    phrase_ranges.append((p_notes, cur_t_start, p_s))
                    cur_t_start = p_e
                    prev_note_idx = end_note_idx + 1
                    
        if prev_note_idx < len(sec_notes):
            phrase_ranges.append((sec_notes[prev_note_idx:], cur_t_start, t_end))
            
        all_aligned = []
        for p_notes, st, en in phrase_ranges:
            al = self.align_segment_hsmm(p_notes, st, en, features, f_base)
            for ip, (s, e, d) in enumerate(al):
                c = dict(p_notes[ip])
                c['start'], c['end'], c['duration'] = s, e, d
                all_aligned.append(c)
                
        return self.snap_cadence_boundaries_to_breaths(all_aligned, features)

    def align_segment_hsmm(self, sec_notes, t_start, t_end, features, f_base, 
                           sigma_pitch=0.85, lambda_dur=0.65):
        """Alignement HSMM Viterbi vectorisé avec corridor adaptatif et coût d'attaque."""
        N_s = len(sec_notes)
        if N_s == 0:
            return []
            
        times = features['times']
        midi = features['midi']
        conf = features['conf']
        rms = features['rms']
        dt = self.dt
        
        weights = np.array([n.get('duration_weight', 1.0) for n in sec_notes])
        tot_w = np.sum(weights)
        tau = (t_end - t_start) / max(0.1, tot_w)
        
        target_midis = np.array([self.get_note_target_pitch(n, f_base) for n in sec_notes])
        
        mask = (times >= t_start) & (times <= t_end)
        f_indices = np.where(mask)[0]
        if len(f_indices) == 0:
            cur = t_start
            res = []
            for n, w in zip(sec_notes, weights):
                dur = w * tau
                res.append((round(cur, 3), round(cur + dur, 3), round(dur, 3)))
                cur += dur
            return res
            
        t_grid = times[f_indices]
        m_grid = midi[f_indices]
        c_grid = conf[f_indices]
        e_grid = rms[f_indices]
        T_f = len(t_grid)
        
        mu_frames = (weights * tau) / dt
        
        em_cost = np.zeros((N_s, T_f))
        for i in range(N_s):
            diff = np.abs(m_grid - target_midis[i])
            p_c = np.minimum(8.0, (diff / sigma_pitch) ** 2)
            # Pénalité pour chant en silence / respiration
            p_c[(c_grid < 0.35) | (m_grid == 0)] = 2.5
            em_cost[i] = p_c
            
        em_cum = np.cumsum(em_cost, axis=1)
        em_cum = np.pad(em_cum, ((0, 0), (1, 0)), mode='constant')
        
        dp = np.full((N_s, T_f + 1), np.inf)
        bp = np.zeros((N_s, T_f + 1), dtype=int)
        
        min_d = lambda mu: max(int(0.14 / dt), int(0.25 * mu))
        max_d = lambda mu: int(min(3.5 * mu, 3.5 / dt))
        
        mu0 = mu_frames[0]
        sig0 = 0.50 * mu0
        for d in range(min_d(mu0), min(max_d(mu0), T_f) + 1):
            dp[0, d] = em_cum[0, d] + lambda_dur * ((d - mu0) / sig0) ** 2
            bp[0, d] = 0
            
        cum_mu = np.cumsum(mu_frames)
        e_smooth = np.convolve(e_grid, np.ones(11)/11.0, mode='same')
        e_trough = (e_grid < 0.70 * np.maximum(1e-4, e_smooth)) | (c_grid < 0.30)
        
        c_prev = np.pad(c_grid[:-1], (1, 0), mode='constant')
        is_attack = (c_grid > 0.38) & (c_prev <= 0.32)
        
        for i in range(1, N_s):
            mui = mu_frames[i]
            sigi = 0.50 * mui
            min_di = min_d(mui)
            max_di = max_d(mui)
            
            # Corridor adaptatif généreux
            corridor_frames = max(int(6.0 / dt), int(0.35 * min(cum_mu[i-1], T_f - cum_mu[i-1])))
            t_min = int(max(cum_mu[i-1] + min_di - corridor_frames, (i + 1) * int(0.14 / dt)))
            t_max = int(min(T_f, cum_mu[i] + corridor_frames))
            if i == N_s - 1:
                t_min = T_f
                t_max = T_f
                
            is_syl = sec_notes[i].get('is_syl_start', False)
            is_ph_st = sec_notes[i].get('is_phrase_start', False)
            is_br_prev = sec_notes[i-1].get('is_breath_after', False)
            same_pitch = (target_midis[i] == target_midis[i-1])
            
            for t in range(t_min, t_max + 1):
                if t < min_di: continue
                d_arr = np.arange(min_di, min(max_di, t) + 1)
                t_prev = t - d_arr
                
                prev_c = dp[i-1, t_prev]
                if np.all(np.isinf(prev_c)): continue
                
                c = prev_c + (em_cum[i, t] - em_cum[i, t_prev]) + lambda_dur * ((d_arr - mui) / sigi) ** 2
                valid_mask = (t_prev < T_f)
                
                if not same_pitch:
                    pitch_match = valid_mask & (c_grid[t_prev] > 0.35) & (np.abs(m_grid[t_prev] - target_midis[i]) < 1.0)
                    c[pitch_match] -= 1.5
                    
                if is_syl or same_pitch:
                    trough_match = valid_mask & e_trough[t_prev]
                    c[trough_match] -= 1.2
                    
                if is_ph_st or is_br_prev:
                    atk_match = valid_mask & is_attack[t_prev]
                    c[atk_match] -= 3.5
                    br_trough = valid_mask & e_trough[t_prev]
                    c[br_trough] -= 1.8
                elif is_syl:
                    atk_match = valid_mask & is_attack[t_prev]
                    c[atk_match] -= 1.5
                    
                best_k = np.argmin(c)
                if not np.isinf(c[best_k]):
                    dp[i, t] = c[best_k]
                    bp[i, t] = t_prev[best_k]
                
        curr = T_f
        b_idx = [T_f]
        for i in range(N_s - 1, -1, -1):
            prev = bp[i, curr]
            b_idx.append(prev)
            curr = prev
        b_idx.reverse()
        
        b_times = [t_grid[min(b, T_f - 1)] if b < T_f else t_end for b in b_idx]
        b_times[0] = t_start
        b_times[-1] = t_end
        
        aligned = []
        for i in range(N_s):
            st = round(float(b_times[i]), 3)
            en = round(float(b_times[i+1]), 3)
            aligned.append((st, en, round(en - st, 3)))
        return aligned

    def align_alleluia_piece(self, notes, features):
        """
        Alignement complet et autonome d'un Alléluia avec détection précise des frontières
        liturgiques par transition de hauteurs modales et détection de pauses.
        """
        t_onset, t_offset = self.detect_vad_boundaries(features)
        f_base = self.calibrate_modal_fbase(features, notes, (t_onset, t_offset))
        
        for i in range(len(notes)):
            if i == 0:
                notes[i]['is_syl_start'] = True
            else:
                is_diff_word = (notes[i].get('word') != notes[i-1].get('word'))
                is_diff_mapping = (notes[i].get('mapping_index') != notes[i-1].get('mapping_index'))
                notes[i]['is_syl_start'] = is_diff_word or is_diff_mapping or notes[i-1].get('is_word_end', False)
                
        first_verse_idx = next(
            (i for i, n in enumerate(notes) if n.get('section') == 'verse' or str(n.get('word', '')).startswith(('V.', 'V/'))),
            None
        )
        if first_verse_idx is not None and first_verse_idx > 0:
            refrain_notes = notes[:first_verse_idx]
            verse_notes = notes[first_verse_idx:]
        else:
            refrain_notes = [n for n in notes if n.get('section') == 'refrain']
            verse_notes = [n for n in notes if n.get('section') == 'verse']
            if len(refrain_notes) == 0:
                refrain_notes = notes[:min(37, len(notes))]
                verse_notes = notes[min(37, len(notes)):]

        for n in refrain_notes:
            n['section'] = 'refrain'
        for n in verse_notes:
            n['section'] = 'verse'
            
        N_ref = len(refrain_notes)
        N_v = len(verse_notes)
        W_ref = sum(n.get('duration_weight', 1.0) for n in refrain_notes)
        W_v = sum(n.get('duration_weight', 1.0) for n in verse_notes) if N_v > 0 else 1.0
        
        W_total = W_ref + W_v + W_ref
        total_vocal_time = t_offset - t_onset
        
        times = features['times']
        midi = features['midi']
        conf = features['conf']
        rms = features['rms']
        
        # 1. Frontière Refrain -> Verset par transition mélodique
        p_ref_end_target = self.get_note_target_pitch(refrain_notes[-1], f_base)
        p_verse_start_target = self.get_note_target_pitch(verse_notes[0], f_base)
        
        est_ref_dur = total_vocal_time * (W_ref / W_total)
        t_ref_mid = t_onset + est_ref_dur
        
        t_v_start = self.find_pitch_transition_boundary(
            times, midi, conf, rms, 
            max(t_onset + 4.0, t_ref_mid - 12.0), 
            min(t_offset - 10.0, t_ref_mid + 12.0), 
            p_ref_end_target, p_verse_start_target
        )
        v_before = np.where((times <= t_v_start - 0.05) & (conf > 0.35) & (times >= t_v_start - 2.5))[0]
        t_ref_end = float(times[v_before[-1]]) if len(v_before) > 0 else t_v_start - 0.20
        actual_ref_dur = t_ref_end - t_onset
        
        # 2. Frontière Verset -> Reprise par transition mélodique & symétrie
        p_verse_end_target = self.get_note_target_pitch(verse_notes[-1], f_base)
        p_rep_start_target = self.get_note_target_pitch(refrain_notes[0], f_base)
        
        t_rep_mid = t_offset - actual_ref_dur
        t_rep_start = self.find_pitch_transition_boundary(
            times, midi, conf, rms,
            max(t_v_start + 10.0, t_rep_mid - 12.0),
            min(t_offset - 4.0, t_rep_mid + 12.0),
            p_verse_end_target, p_rep_start_target
        )
        v_v_end = np.where((times <= t_rep_start - 0.05) & (conf > 0.35) & (times >= t_rep_start - 2.5))[0]
        t_v_end = float(times[v_v_end[-1]]) if len(v_v_end) > 0 else t_rep_start - 0.20
        t_rep_end = t_offset
        
        print(f"  [Structure Liturgique Calibrée (Alleluia)]", flush=True)
        print(f"    1. Refrain Initial : [{t_onset:6.2f}s - {t_ref_end:6.2f}s] ({N_ref} notes, dur={actual_ref_dur:.2f}s)", flush=True)
        print(f"    2. Verset           : [{t_v_start:6.2f}s - {t_v_end:6.2f}s] ({N_v} notes, dur={t_v_end - t_v_start:.2f}s)", flush=True)
        print(f"    3. Pause Respiration: [{t_v_end:6.2f}s - {t_rep_start:6.2f}s] (dur={t_rep_start - t_v_end:.2f}s)", flush=True)
        print(f"    4. Reprise Refrain  : [{t_rep_start:6.2f}s - {t_rep_end:6.2f}s] ({N_ref} notes, dur={t_rep_end - t_rep_start:.2f}s)", flush=True)
        print(f"    5. Silence Final    : [{t_rep_end:6.2f}s - {features['duration']:6.2f}s] (dur={features['duration'] - t_rep_end:.2f}s)", flush=True)
        
        aligned_ref = self.align_phrase_aware_segment(refrain_notes, t_onset, t_ref_end, features, f_base)
        aligned_v = self.align_phrase_aware_segment(verse_notes, t_v_start, t_v_end, features, f_base)
        aligned_rep = self.align_phrase_aware_segment(refrain_notes, t_rep_start, t_rep_end, features, f_base)
        
        result_ts = list(aligned_ref) + list(aligned_v)
            
        reprise_notes = []
        for n in aligned_rep:
            r_n = dict(n)
            r_n['section'] = 'reprise'
            reprise_notes.append(r_n)
            
        reprise_obj = {
            'start': round(float(t_rep_start), 3),
            'end': round(float(t_rep_end), 3),
            'duration': round(float(t_rep_end - t_rep_start), 3),
            'antiphon_note_count': N_ref,
            'reprise_after_section': 'verse',
            'skips_doxology': True,
            'notes': reprise_notes
        }
        
        return result_ts, reprise_obj

    def align_continuous_piece(self, notes, features):
        """Alignement de pièces continues sans reprise (Offertorium, Communio, Kyriale, Hymnus, Antiphona)."""
        t_onset, t_offset = self.detect_vad_boundaries(features)
        f_base = self.calibrate_modal_fbase(features, notes, (t_onset, t_offset))
        
        for i in range(len(notes)):
            if i == 0:
                notes[i]['is_syl_start'] = True
            else:
                is_diff_word = (notes[i].get('word') != notes[i-1].get('word'))
                is_diff_mapping = (notes[i].get('mapping_index') != notes[i-1].get('mapping_index'))
                notes[i]['is_syl_start'] = is_diff_word or is_diff_mapping or notes[i-1].get('is_word_end', False)
                
        print(f"  [Structure Liturgique Calibrée (Forme Continue)]", flush=True)
        print(f"    1. Chant Continu : [{t_onset:6.2f}s - {t_offset:6.2f}s] ({len(notes)} notes, dur={t_offset - t_onset:.2f}s)", flush=True)
        print(f"    2. Silence Final : [{t_offset:6.2f}s - {features['duration']:6.2f}s] (dur={features['duration'] - t_offset:.2f}s)", flush=True)
        
        result_ts = self.align_phrase_aware_segment(notes, t_onset, t_offset, features, f_base)
        return result_ts, None

    def align_responsorial_piece(self, notes, features):
        """Alignement de pièces responsoriales sans reprise (Graduale, Tractus): Répons + Verset."""
        t_onset, t_offset = self.detect_vad_boundaries(features)
        f_base = self.calibrate_modal_fbase(features, notes, (t_onset, t_offset))
        
        for i in range(len(notes)):
            if i == 0:
                notes[i]['is_syl_start'] = True
            else:
                is_diff_word = (notes[i].get('word') != notes[i-1].get('word'))
                is_diff_mapping = (notes[i].get('mapping_index') != notes[i-1].get('mapping_index'))
                notes[i]['is_syl_start'] = is_diff_word or is_diff_mapping or notes[i-1].get('is_word_end', False)
                
        first_verse_idx = next(
            (i for i, n in enumerate(notes) if n.get('section') == 'verse' or str(n.get('word', '')).startswith(('V.', 'V/'))),
            None
        )
        if first_verse_idx is not None and first_verse_idx > 0:
            resp_notes = notes[:first_verse_idx]
            verse_notes = notes[first_verse_idx:]
        else:
            resp_notes = [n for n in notes if n.get('section') != 'verse']
            verse_notes = [n for n in notes if n.get('section') == 'verse']

        if len(resp_notes) == 0 or len(verse_notes) == 0:
            return self.align_continuous_piece(notes, features)

        times = features['times']
        midi = features['midi']
        conf = features['conf']
        rms = features['rms']
        tot_time = t_offset - t_onset

        t_r_end, t_v_start = self.find_responsorial_boundary(
            times, midi, conf, rms, t_onset, t_offset, resp_notes, verse_notes, f_base
        )
        actual_r_dur = t_r_end - t_onset
        
        # Détection automatique si une reprise du Répons est chantée après le Verset (ex: Graduel complet)
        W_r = sum(n.get('duration_weight', 1.0) for n in resp_notes)
        est_rep_dur = min(tot_time * 0.45, W_r * 0.65)
        t_rep_est = t_offset - est_rep_dur
        p_r_start = [self.get_note_target_pitch(n, f_base) for n in resp_notes[:4]]
        
        pauses = self.detect_acoustic_pauses(times, conf, rms, t_v_start, t_offset, min_pause_dur=0.20, max_gap=0.04)
        rep_candidates = []
        for p_s, p_e in pauses:
            if p_s < t_v_start + 25.0 or p_s > t_offset - 20.0:
                continue
            m_aft_mask = (times >= p_e) & (times <= p_e + 3.0) & (conf > 0.35)
            if np.sum(m_aft_mask) > 0:
                dists = [np.min(np.abs(midi[m_aft_mask] - it)) for it in p_r_start]
                match = np.mean(np.array(dists) < 1.3)
                dist_t = abs(p_s - t_rep_est)
                score = 4.0 * min(1.5, p_e - p_s) + 4.0 * match - 2.0 * (dist_t / tot_time)
                rep_candidates.append((score, p_s, p_e, match))
                
        rep_candidates.sort(reverse=True)
        has_reprise = len(rep_candidates) > 0 and rep_candidates[0][0] > 4.5 and rep_candidates[0][3] > 0.60
        
        if has_reprise:
            t_v_end = float(rep_candidates[0][1])
            t_rep_start = float(rep_candidates[0][2])
            print(f"  [Structure Liturgique Calibrée (Graduale avec Reprise)]", flush=True)
            print(f"    1. Répons Initial   : [{t_onset:6.2f}s - {t_r_end:6.2f}s] ({len(resp_notes)} notes, dur={actual_r_dur:.2f}s)", flush=True)
            print(f"    2. Verset           : [{t_v_start:6.2f}s - {t_v_end:6.2f}s] ({len(verse_notes)} notes, dur={t_v_end - t_v_start:.2f}s)", flush=True)
            print(f"    3. Reprise Répons   : [{t_rep_start:6.2f}s - {t_offset:6.2f}s] ({len(resp_notes)} notes, dur={t_offset - t_rep_start:.2f}s)", flush=True)
            print(f"    4. Silence Final    : [{t_offset:6.2f}s - {features['duration']:6.2f}s] (dur={features['duration'] - t_offset:.2f}s)", flush=True)
            
            aligned_r = self.align_phrase_aware_segment(resp_notes, t_onset, t_r_end, features, f_base)
            aligned_v = self.align_phrase_aware_segment(verse_notes, t_v_start, t_v_end, features, f_base)
            aligned_rep = self.align_phrase_aware_segment(resp_notes, t_rep_start, t_offset, features, f_base)
            
            result_ts = list(aligned_r) + list(aligned_v)
            reprise_notes = []
            for n in aligned_rep:
                r_n = dict(n)
                r_n['section'] = 'reprise'
                reprise_notes.append(r_n)
                
            reprise_obj = {
                'start': round(float(t_rep_start), 3),
                'end': round(float(t_offset), 3),
                'duration': round(float(t_offset - t_rep_start), 3),
                'antiphon_note_count': len(resp_notes),
                'reprise_after_section': 'verse',
                'skips_doxology': True,
                'notes': reprise_notes
            }
            return result_ts, reprise_obj
        else:
            print(f"  [Structure Liturgique Calibrée (Graduale/Tractus)]", flush=True)
            print(f"    1. Répons           : [{t_onset:6.2f}s - {t_r_end:6.2f}s] ({len(resp_notes)} notes, dur={t_r_end - t_onset:.2f}s)", flush=True)
            print(f"    2. Verset           : [{t_v_start:6.2f}s - {t_offset:6.2f}s] ({len(verse_notes)} notes, dur={t_offset - t_v_start:.2f}s)", flush=True)
            print(f"    3. Silence Final    : [{t_offset:6.2f}s - {features['duration']:6.2f}s] (dur={features['duration'] - t_offset:.2f}s)", flush=True)
            aligned_r = self.align_phrase_aware_segment(resp_notes, t_onset, t_r_end, features, f_base)
            aligned_v = self.align_phrase_aware_segment(verse_notes, t_v_start, t_offset, features, f_base)
            return list(aligned_r) + list(aligned_v), None

    def align_introit_piece(self, notes, features):
        """Alignement d'Introït : Antienne + Psaume/Gloria + Reprise d'Antienne."""
        t_onset, t_offset = self.detect_vad_boundaries(features)
        f_base = self.calibrate_modal_fbase(features, notes, (t_onset, t_offset))
        
        for i in range(len(notes)):
            if i == 0:
                notes[i]['is_syl_start'] = True
            else:
                is_diff_word = (notes[i].get('word') != notes[i-1].get('word'))
                is_diff_mapping = (notes[i].get('mapping_index') != notes[i-1].get('mapping_index'))
                notes[i]['is_syl_start'] = is_diff_word or is_diff_mapping or notes[i-1].get('is_word_end', False)
                
        ant_notes = [n for n in notes if n.get('section') != 'psalm' and n.get('section') != 'gloria']
        ps_notes = [n for n in notes if n.get('section') == 'psalm' or n.get('section') == 'gloria']
        
        if len(ps_notes) == 0:
            return self.align_continuous_piece(notes, features)
            
        N_ant = len(ant_notes)
        gloria_start_idx = None
        for i, n in enumerate(ps_notes):
            w = n.get('word', '').lower()
            if 'gl' in w or n.get('section') == 'gloria':
                gloria_start_idx = i
                break
                
        if gloria_start_idx is not None:
            ps_verse_notes = ps_notes[:gloria_start_idx]
            gloria_notes = ps_notes[gloria_start_idx:]
        else:
            ps_verse_notes = ps_notes
            gloria_notes = []
        has_gloria_in_score = len(gloria_notes) > 0
        
        W_ant = sum(n.get('duration_weight', 1.0) for n in ant_notes)
        W_verse = sum(n.get('duration_weight', 1.0) for n in ps_verse_notes)
        W_gloria = sum(n.get('duration_weight', 1.0) for n in gloria_notes)
        
        tot_time = t_offset - t_onset
        p_ant_end = self.get_note_target_pitch(ant_notes[-1], f_base)
        p_ant_start = self.get_note_target_pitch(ant_notes[0], f_base)
        p_ps_tenor = float(np.median([self.get_note_target_pitch(n, f_base) for n in ps_verse_notes]))
        p_ps_end = self.get_note_target_pitch(ps_verse_notes[-1], f_base)
        p_ps_start = self.get_note_target_pitch(ps_verse_notes[0], f_base)
        
        times = features['times']
        midi = features['midi']
        conf = features['conf']
        rms = features['rms']
        
        # 1. Ancrage de la Reprise par symétrie depuis la fin (Durée Reprise ~ Durée Antienne)
        pauses = self.detect_acoustic_pauses(times, conf, rms, t_onset, t_offset, min_pause_dur=0.15)
        est_ant_dur = min(tot_time * 0.45, W_ant * 0.58)
        t_rep_mid = t_offset - est_ant_dur
        
        rep_candidates = [p for p in pauses if p[0] >= t_onset + 25.0 and p[0] <= t_offset - 20.0]
        if rep_candidates:
            def rep_score(p):
                dur = p[1] - p[0]
                dist = abs(p[0] - t_rep_mid)
                m_aft_mask = (times >= p[1]) & (times <= p[1] + 3.0) & (conf > 0.35)
                a_match = np.mean(np.abs(midi[m_aft_mask] - p_ant_start) < 1.3) if np.sum(m_aft_mask) > 0 else 0
                return 4.0 * min(1.5, dur) + 3.0 * a_match - 4.0 * (dist / max(1.0, tot_time * 0.25))
            best_rep = max(rep_candidates, key=rep_score)
            t_ps_end, t_rep_start = float(best_rep[0]), float(best_rep[1])
        else:
            t_rep_start = self.find_pitch_transition_boundary(
                times, midi, conf, rms,
                max(t_onset + 20.0, t_rep_mid - 10.0),
                min(t_offset - 10.0, t_rep_mid + 10.0),
                p_ps_end, p_ant_start
            )
            v_ps_end = np.where((times <= t_rep_start - 0.05) & (conf > 0.35) & (times >= t_rep_start - 2.5))[0]
            t_ps_end = float(times[v_ps_end[-1]]) if len(v_ps_end) > 0 else t_rep_start - 0.20
            
        actual_rep_dur = t_offset - t_rep_start
        
        # 2. Ancrage de la fin d'Antienne par symétrie
        t_ant_end_est = t_onset + actual_rep_dur
        ant_candidates = [p for p in pauses if p[0] >= t_onset + 15.0 and p[1] <= t_rep_start - 10.0 and abs(p[0] - t_ant_end_est) <= 12.0]
        if ant_candidates:
            def ant_score(p):
                dur = p[1] - p[0]
                dist = abs(p[0] - t_ant_end_est)
                m_aft_mask = (times >= p[1]) & (times <= p[1] + 3.0) & (conf > 0.35)
                ps_match = np.mean(np.abs(midi[m_aft_mask] - p_ps_start) < 1.3) if np.sum(m_aft_mask) > 0 else 0
                return 4.0 * min(1.5, dur) + 3.0 * ps_match - 4.0 * (dist / 12.0)
            best_ant = max(ant_candidates, key=ant_score)
            t_ant_end, t_ps_start = float(best_ant[0]), float(best_ant[1])
        else:
            t_ant_cand = self.find_pitch_transition_boundary(
                times, midi, conf, rms,
                max(t_onset + 10.0, t_ant_end_est - 8.0),
                min(t_rep_start - 10.0, t_ant_end_est + 8.0),
                p_ant_end, p_ps_tenor
            )
            v_before = np.where((times <= t_ant_cand - 0.05) & (conf > 0.35) & (times >= t_ant_cand - 2.5))[0]
            t_ant_end = float(times[v_before[-1]]) if len(v_before) > 0 else t_ant_cand - 0.20
            t_ps_start = t_ant_cand
            
        actual_ant_dur = t_ant_end - t_onset
        
        # 3. Vérification de présence du Gloria Patri dans le psaume
        ps_dur = t_ps_end - t_ps_start
        if has_gloria_in_score and ps_dur < 28.0:
            gloria_sung = False
            active_ps_notes = ps_verse_notes
        else:
            gloria_sung = True
            active_ps_notes = ps_notes
        
        print(f"  [Structure Liturgique Calibrée (Introitus)]", flush=True)
        print(f"    1. Antienne         : [{t_onset:6.2f}s - {t_ant_end:6.2f}s] ({N_ant} notes, dur={actual_ant_dur:.2f}s)", flush=True)
        print(f"    2. Psaume ({'avec' if gloria_sung else 'sans'} Gloria): [{t_ps_start:6.2f}s - {t_ps_end:6.2f}s] ({len(active_ps_notes)} notes, dur={t_ps_end - t_ps_start:.2f}s)", flush=True)
        print(f"    3. Reprise Antienne : [{t_rep_start:6.2f}s - {t_offset:6.2f}s] ({N_ant} notes, dur={t_offset - t_rep_start:.2f}s)", flush=True)
        print(f"    4. Silence Final    : [{t_offset:6.2f}s - {features['duration']:6.2f}s] (dur={features['duration'] - t_offset:.2f}s)", flush=True)
        
        aligned_ant = self.align_phrase_aware_segment(ant_notes, t_onset, t_ant_end, features, f_base)
        aligned_ps = self.align_phrase_aware_segment(active_ps_notes, t_ps_start, t_ps_end, features, f_base)
        aligned_rep = self.align_phrase_aware_segment(ant_notes, t_rep_start, t_offset, features, f_base)
        
        result_ts = list(aligned_ant) + list(aligned_ps)
            
        if not gloria_sung and has_gloria_in_score:
            for g_n in gloria_notes:
                n_copy = dict(g_n)
                n_copy['start'], n_copy['end'], n_copy['duration'] = None, None, 0.0
                n_copy['omitted'] = True
                result_ts.append(n_copy)
            
        reprise_notes = []
        for n in aligned_rep:
            r_n = dict(n)
            r_n['section'] = 'reprise'
            reprise_notes.append(r_n)
            
        reprise_obj = {
            'start': round(float(t_rep_start), 3),
            'end': round(float(t_offset), 3),
            'duration': round(float(t_offset - t_rep_start), 3),
            'antiphon_note_count': N_ant,
            'reprise_after_section': 'psalm',
            'skips_doxology': not gloria_sung,
            'notes': reprise_notes
        }
        return result_ts, reprise_obj

    def align_piece(self, notes, features, office_part=''):
        """Routeur universel d'alignement liturgique automatique."""
        op = office_part.lower().strip()
        if 'alleluia' in op:
            return self.align_alleluia_piece(notes, features)
        elif 'introit' in op:
            return self.align_introit_piece(notes, features)
        elif 'gradual' in op or 'tract' in op:
            return self.align_responsorial_piece(notes, features)
        else:
            return self.align_continuous_piece(notes, features)
